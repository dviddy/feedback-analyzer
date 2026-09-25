const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projectJourneys } = require('../../browser');
const { taxonomy, exactRules, themeRules } = require('../../journey-mapping');
const base = { category: 'Account Access', sentiment: 'Negative', effort: 'High', priority: 'High', painPoint: 'Repeated login errors prevented access.', recommendedAction: 'Investigate login errors.' };
const row = (record, changes = {}) => ({ record, feedback: `Original feedback ${record}`, analysis: { ...base, ...changes } });
const stage = (result, name) => result.journeys.flatMap(journey => journey.stages).find(stage => stage.name === name);

test('recognized login and password-reset themes map independently with ordered taxonomy', () => {
    const result = projectJourneys([row(2), row(3, { painPoint: 'The password reset email did not arrive.' })]);
    assert.deepEqual(result.journeys.map(j => j.name), ['Digital Account Access']);
    assert.deepEqual(result.journeys[0].stages.map(s => s.name), taxonomy['Digital Account Access']);
    assert.deepEqual(stage(result, 'Authenticate').supportingRecords.map(r => r.record), [2]);
    assert.deepEqual(stage(result, 'Recover Access').supportingRecords.map(r => r.record), [3]);
});
test('ambiguous and unrelated access issues stay unmapped; categories cannot leak', () => {
    const pains = ['MFA verification failed', 'Account locked', 'Username unavailable', 'Password reset link expired',
        'Cannot log in and password reset email did not arrive', 'Login errors resolved successfully', 'Account settings unavailable'];
    const rows = pains.map((painPoint, i) => row(i + 2, { painPoint }));
    rows.push(row(20, { category: 'Other', painPoint: 'Login Access Failure' }));
    const result = projectJourneys(rows);
    assert.deepEqual(result.journeys, []);
    assert.equal(result.unmapped.length, rows.length);
    assert.equal(result.unmapped[0].feedback, 'Original feedback 2');
});
test('metrics are per distinct validated record, with both statuses and original evidence', () => {
    const rows = [row(9, { sentiment: 'Positive', effort: 'Low', priority: 'Low' }), row(2), row(6, { sentiment: 'Neutral', priority: 'Low' })];
    const before = JSON.stringify(rows);
    const result = projectJourneys([...rows, rows[1], { ...row(3), error: 'Failed' }, row(4, { sentiment: 'Unknown' }),
        { record: 5, error: 'Failed' }, undefined, row(1), row(2.5)]);
    const auth = stage(result, 'Authenticate');
    assert.equal(auth.count, 3);
    assert.equal(auth.negativePercent, 33);
    assert.equal(auth.highEffort, 2);
    assert.equal(auth.highPriority, 1);
    assert.deepEqual(auth.statuses, ['Attention Needed', 'High Friction']);
    assert.deepEqual(auth.themes, ['Login Access Failure']);
    assert.deepEqual(auth.supportingRecords.map(r => r.record), [2, 6, 9]);
    assert.equal(auth.supportingRecords[0].feedback, rows[1].feedback);
    assert.deepEqual(auth.supportingRecords[0].analysis, rows[1].analysis);
    assert.equal(auth.supportingRecords[0].emergingInsight, 'Account Access: Login Access Failure');
    assert.equal(result.unmapped.length, 0);
    assert.equal(JSON.stringify(rows), before);
});
test('empty stages have no health inference, while positive-only evidence is included', () => {
    const result = projectJourneys([row(2, { painPoint: 'Successful login', sentiment: 'Positive', effort: 'Low', priority: 'Low' })]);
    const auth = stage(result, 'Authenticate');
    assert.equal(auth.count, 1);
    assert.equal(auth.negativePercent, 0);
    assert.deepEqual(auth.statuses, ['Feedback Observed']);
    assert.equal(auth.supportingRecords[0].emergingInsight, null);
    const absent = stage(result, 'Recover Access');
    assert.deepEqual(absent.statuses, ['No Feedback Observed']);
    assert.equal(absent.negativePercent, null);
    assert.equal(absent.count, 0);
    assert.deepEqual(absent.themes, []);
    assert.deepEqual(absent.supportingRecords, []);
});
test('high effort and high priority are independently derived', () => {
    assert.deepEqual(stage(projectJourneys([row(2, { priority: 'Low' })]), 'Authenticate').statuses, ['High Friction']);
    assert.deepEqual(stage(projectJourneys([row(2, { effort: 'Low' })]), 'Authenticate').statuses, ['Attention Needed']);
});
test('all exact rules target real taxonomy stages and never match substrings or another category', () => {
    for (const rule of [...themeRules, ...exactRules]) assert.ok(taxonomy[rule.journey].includes(rule.stage));
    for (const rule of exactRules) for (const painPoint of rule.phrases) {
        const result = projectJourneys([row(2, { category: rule.category, painPoint })]);
        assert.equal(result.journeys[0].name, rule.journey);
        assert.equal(stage(result, rule.stage).count, 1);
        assert.equal(projectJourneys([row(2, { category: 'Other', painPoint })]).unmapped.length, 1);
        // Explicitly multi-issue descriptions must not acquire an exact-rule match.
        assert.equal(projectJourneys([row(2, { category: rule.category, painPoint: `${painPoint} and unrelated service issue` })]).unmapped.length, 1);
    }
});
test('all-failure and empty datasets create neither journeys nor fabricated evidence', () => {
    for (const rows of [[], [{ record: 2, error: 'Failed' }], [row(2, { extra: 'invalid' })]]) {
        assert.deepEqual(projectJourneys(rows), { journeys: [], unmapped: [] });
    }
});

test('explicit branch staff interactions map positive and negative evidence only to Meet Employee', () => {
    const positive = { record: 8, feedback: 'The branch staff were friendly and helpful.', analysis: { ...base, category: 'Branch', sentiment: 'Positive', effort: 'Low', priority: 'Low', painPoint: 'No pain point identified', recommendedAction: 'Maintain helpful service.' } };
    const negative = { record: 12, feedback: 'The branch employees were rude and unhelpful.', analysis: { ...base, category: 'Branch', painPoint: 'Unhelpful staff interaction.' } };
    const another = { ...negative, record: 15 };
    const unrelated = { ...positive, record: 20, feedback: 'The branch was convenient.' };
    const result = projectJourneys([positive, negative, another, unrelated]);
    assert.deepEqual(result.journeys.map(j => j.name), ['Branch Service']);
    const meet = stage(result, 'Meet Employee');
    assert.equal(meet.count, 3);
    assert.equal(meet.negativePercent, 67);
    assert.equal(meet.highEffort, 2);
    assert.equal(meet.highPriority, 2);
    for (const [index, original] of [positive, negative, another].entries()) {
        const evidence = meet.supportingRecords[index];
        assert.equal(evidence.record, original.record);
        assert.equal(evidence.feedback, original.feedback);
        assert.deepEqual(evidence.analysis, original.analysis);
    }
    assert.equal(meet.supportingRecords[0].emergingInsight, null);
    assert.equal(meet.supportingRecords[1].emergingInsight, 'Branch: Unhelpful staff interaction.');
    assert.match(meet.supportingRecords[0].mappingReason, /original feedback/);
    for (const other of result.journeys[0].stages.filter(s => s.name !== 'Meet Employee')) {
        assert.equal(other.count, 0);
        assert.deepEqual(other.statuses, ['No Feedback Observed']);
    }
    assert.deepEqual(result.unmapped.map(r => r.record), [20]);
    const onlyPositive = stage(projectJourneys([positive]), 'Meet Employee');
    assert.deepEqual(onlyPositive.statuses, ['Feedback Observed']);
    assert.equal(onlyPositive.negativePercent, 0);
});

test('branch staff rule rejects vague, hypothetical, mixed-stage, and wrong-category feedback', () => {
    const feedbacks = ['Branch staff', 'I hope the branch staff were friendly and helpful.',
        'The branch staff were friendly and helpful but the account opening failed.',
        'The branch was friendly and helpful.'];
    const outcomes = feedbacks.map((feedback, i) => ({ ...row(i + 2, { category: 'Branch', painPoint: 'No pain point identified' }), feedback }));
    outcomes.push({ ...row(20, { category: 'Other', painPoint: 'No pain point identified' }), feedback: 'The branch staff were friendly and helpful.' });
    assert.equal(projectJourneys(outcomes).unmapped.length, outcomes.length);
    const painBased = projectJourneys([row(30, { category: 'Branch', painPoint: 'The branch teller was dismissive.' })]);
    assert.equal(stage(painBased, 'Meet Employee').count, 1);
    const notHelpful = projectJourneys([{ ...row(31, { category: 'Branch', painPoint: 'No specific pain point' }), feedback: 'The branch staff were not helpful.' }]);
    assert.equal(stage(notHelpful, 'Meet Employee').count, 1);
});
