const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projectJourneys, parseCSV, analyzeComments } = require('../../browser');
const { deriveEmotion, touchpoints, taxonomy, definitions } = require('../../journey-mapping');
const base = { category: 'Account Access', sentiment: 'Negative', effort: 'High', priority: 'High', painPoint: 'Login access failure', recommendedAction: 'Improve login error handling.' };
const row = (record, analysis = {}, feedback = 'I am frustrated. The login screen shows an error.') => ({ record, feedback_id: `f-${record}`, feedback, analysis: { ...base, ...analysis } });

test('V2 retains taxonomy and controlled goals/actions separately from observed experience', () => {
    const journey = projectJourneys([row(2)]).journeys[0];
    assert.equal(journey.goal, 'Access online banking successfully and complete the intended account task.');
    assert.equal(journey.persona, null);
    assert.equal(journey.view, 'current-state');
    assert.deepEqual(journey.stages.map(s => s.name), taxonomy[journey.name]);
    assert.equal(journey.stages[1].memberAction, 'Member enters credentials and attempts authentication.');
    for (const [name, stages] of Object.entries(taxonomy)) for (const stage of stages) assert.ok(definitions[name].actions[stage]);
    const empty = journey.stages[0];
    assert.equal(empty.currentState, 'No feedback evidence observed');
    for (const key of ['painPoints', 'emotions', 'solutions', 'supportingRecords', 'touchpoints']) assert.deepEqual(empty[key], []);
    assert.equal(empty.negativePercent, null);
    assert.deepEqual(empty.statuses, ['No Feedback Observed']);
    assert.equal(empty.provenance.memberAction, 'Controlled journey definition');
});

test('V2 metrics, themes, recommendations and provenance use only distinct validated supporting records', () => {
    const input = [row(2), row(3, { effort: 'Medium', priority: 'Low', recommendedAction: 'Review recovery options.' }), row(4, { sentiment: 'Positive', effort: 'Low', priority: 'Medium' }), row(5, { painPoint: 'The password reset email did not arrive.' }, 'My password reset email never arrived.')];
    const before = JSON.stringify(input);
    const journey = projectJourneys([...input, input[0], { ...row(8), error: 'failed' }, row(9, { effort: 'Invalid' })]).journeys[0];
    const auth = journey.stages[1];
    assert.equal(auth.count, 3);
    assert.equal(auth.negativePercent, 67);
    assert.deepEqual(auth.effortCounts, { High: 1, Medium: 1, Low: 1 });
    assert.deepEqual(auth.priorityCounts, { High: 1, Medium: 1, Low: 1 });
    assert.equal(auth.painPoints[0].count, 2);
    assert.ok(auth.painPoints[0].descriptions.every(text => input.some(r => r.analysis.painPoint === text)));
    assert.equal(auth.solutions[0].text, base.recommendedAction);
    assert.deepEqual(auth.solutions[0].records, [2, 4]);
    assert.equal(auth.solutions[0].provenance, 'Proposed recommendation');
    assert.equal(auth.solutions[0].userText, null);
    assert.equal(auth.owner, null);
    assert.deepEqual(auth.assignment, { owner: null, department: null, status: null, dueDate: null });
    assert.equal(auth.supportingRecords[0].feedback_id, 'f-2');
    assert.equal(auth.supportingRecords[0].feedback, input[0].feedback);
    assert.equal(journey.stages[2].count, 1);
    assert.deepEqual(journey.stages[2].touchpoints, ['Password Reset', 'Email']);
    assert.equal(JSON.stringify(input), before);
});

test('emotion abstains from sentiment, negation, hypothetical, quoted and third-person feelings', () => {
    for (const text of ['Terrible service', 'I am not frustrated.', 'If I was frustrated.', 'The employee was anxious.', '“I am frustrated”.', 'I was frustrated but now I am satisfied.', undefined]) {
        assert.equal(deriveEmotion(text)[0].label, 'Emotion not identified');
        assert.equal(deriveEmotion(text)[0].source, 'Unavailable');
    }
    for (const label of ['Frustrated', 'Confused', 'Anxious', 'Satisfied', 'Relieved']) {
        const result = deriveEmotion(`I feel ${label.toLowerCase()}.`)[0];
        assert.equal(result.label, label);
        assert.equal(result.source, 'Explicitly detected from feedback');
        assert.ok(result.wording);
    }
    const auth = projectJourneys([row(2, {}, 'The login failed.')]).journeys[0].stages[1];
    assert.equal(auth.emotions[0].label, 'Emotion not identified');
    assert.deepEqual(auth.touchpoints, []);
});

test('channels require actual explicit mentions; positive records do not create pain points', () => {
    assert.deepEqual(touchpoints('Access failed.'), []);
    assert.deepEqual(touchpoints('I wish there was a mobile app.'), []);
    const auth = projectJourneys([row(2, { sentiment: 'Positive', painPoint: 'Successful login', effort: 'Low', priority: 'Low' }, 'I am relieved. Online banking worked.')]).journeys[0].stages[1];
    assert.deepEqual(auth.touchpoints, ['Online Banking']);
    assert.deepEqual(auth.painPoints, []);
    assert.equal(auth.negativePercent, 0);
    assert.equal(auth.count, 1);
});

test('optional feedback_id survives CSV, queue, and journey projection without provider input changes', async () => {
    const parsed = parseCSV('feedback_id,feedback\nmember-9,Login failed\n,Login failed', require('papaparse'));
    const calls = [];
    const outcomes = await analyzeComments(parsed.comments, { analyze: async feedback => { calls.push(feedback); return base; } });
    const support = projectJourneys(outcomes).journeys[0].stages[1].supportingRecords;
    assert.equal(support[0].feedback_id, 'member-9');
    assert.equal(support[1].feedback_id, undefined);
    assert.deepEqual(calls, ['Login failed', 'Login failed']);
});
