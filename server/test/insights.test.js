const { test } = require('node:test');
const assert = require('node:assert/strict');
const { aggregateInsights, analyzeComments } = require('../../browser');
const base = { category: 'Account Access', sentiment: 'Negative', effort: 'High', priority: 'High', painPoint: 'Repeated login failures.', recommendedAction: 'Investigate login failures.' };
const row = (record, changes = {}) => ({ record, feedback: `Original feedback ${record}`, analysis: { ...base, ...changes } });

test('two comments group by category and normalized pain point with original record traceability', () => {
    const rows = [row(2), row(7, { painPoint: ' REPEATED  login failures! ' })];
    const [insight] = aggregateInsights(rows);
    assert.equal(aggregateInsights(rows).length, 1);
    assert.equal(insight.count, 2);
    assert.deepEqual(insight.supportingRecords.map(r => r.record), [2, 7]);
    assert.deepEqual(insight.supportingRecords.map(r => r.feedback), rows.map(r => r.feedback));
    assert.deepEqual(insight.supportingRecords[0].analysis, rows[0].analysis);
    assert.match(insight.title, /Account Access: Login Access Failure/);
});
test('unrelated pain points, categories, and negations remain separate', () => {
    const insights = aggregateInsights([row(2), row(3), row(4, { painPoint: 'Password reset email missing' }), row(5, { painPoint: 'Password reset email missing' }), row(6, { category: 'Website' }), row(7, { painPoint: 'No repeated login failures' })]);
    assert.equal(insights.length, 2);
    assert.deepEqual(insights.map(i => i.supportingRecords.map(r => r.record)), [[2, 3], [4, 5]]);
});
test('positive-only feedback and generic no-issue placeholders do not produce pain-point insights', () => {
    assert.deepEqual(aggregateInsights([row(2, { sentiment: 'Positive' }), row(3, { sentiment: 'Positive' })]), []);
    assert.deepEqual(aggregateInsights([row(2, { painPoint: 'No pain point identified.' }), row(3, { painPoint: 'No pain point identified.' })]), []);
});
test('minimum support is two distinct validated records', () => {
    assert.deepEqual(aggregateInsights([]), []);
    assert.deepEqual(aggregateInsights([row(2)]), []);
    assert.deepEqual(aggregateInsights([row(2), row(2)]), []);
    assert.deepEqual(aggregateInsights([row(2), row(3, { effort: 'Unknown' })]), []);
});
test('negative percentage and effort/priority counts are independently calculated from supporting records', () => {
    const [insight] = aggregateInsights([row(2), row(3, { effort: 'Low', priority: 'Medium' }), row(4, { sentiment: 'Neutral', priority: 'Low' })]);
    assert.equal(insight.count, 3);
    assert.equal(insight.negativePercent, 67);
    assert.equal(insight.highEffort, 2);
    assert.equal(insight.highPriority, 1);
    const [mixed] = aggregateInsights([row(2), row(3, { sentiment: 'Positive', effort: 'Low', priority: 'Low' })]);
    assert.equal(mixed.negativePercent, 50);
});
test('wording and recommendations use evidence, while textual claims cannot fabricate counts', () => {
    const rows = [row(2, { painPoint: '100 members report login failures', recommendedAction: 'Investigate reported failures' }), row(3, { painPoint: '100 members report login failures', recommendedAction: 'Review logs' }), row(4, { painPoint: '100 members report login failures', recommendedAction: 'Review logs' })];
    const [insight] = aggregateInsights(rows);
    assert.equal(insight.count, 3);
    assert.equal(insight.highEffort, 3);
    assert.equal(insight.highPriority, 3);
    assert.equal(insight.negativePercent, 100);
    assert.equal(insight.painPoint, rows[0].analysis.painPoint);
    assert.equal(insight.recommendedFocus, 'Review logs');
    assert.equal(aggregateInsights([{ ...row(5), analysis: { ...base, count: 1000 } }]).length, 0);
});
test('partial failures and pending or invalid records never affect calculations', async () => {
    const outcomes = await analyzeComments([{ record: 2, feedback: 'first' }, { record: 4, feedback: 'fail' }, { record: 8, feedback: 'last' }], { analyze: async feedback => {
        if (feedback === 'fail') throw new Error('Failed');
        return { ...base, sentiment: feedback === 'last' ? 'Neutral' : 'Negative' };
    } });
    const [insight] = aggregateInsights([...outcomes, undefined, { ...row(9), error: 'Failed' }, row(10, { category: 'Invalid' })]);
    assert.equal(insight.count, 2);
    assert.equal(insight.negativePercent, 50);
    assert.equal(insight.highEffort, 2);
    assert.equal(insight.highPriority, 2);
    assert.deepEqual(insight.supportingRecords.map(r => [r.record, r.feedback]), [[2, 'first'], [8, 'last']]);
    assert.deepEqual(aggregateInsights([{ record: 2, error: 'Failed' }]), []);
});

const loginParaphrases = [
    'Repeated login errors prevented the customer from accessing their account after three attempts.',
    'Repeated login errors prevented the member from accessing their account.',
    'The member was unable to sign in despite repeated attempts.'
];
const resetParaphrases = [
    'The password reset email did not arrive, preventing access recovery.',
    'The password reset email did not arrive, preventing the customer from regaining account access.',
    'The member never received the password reset email.'
];
test('controlled login theme groups customer/member wording and repeated-login paraphrases', () => {
    const rows = loginParaphrases.map((painPoint, i) => row(i + 2, { painPoint }));
    const [insight] = aggregateInsights(rows);
    assert.equal(insight.count, 3);
    assert.equal(insight.title, 'Account Access: Login Access Failure');
    assert.deepEqual(insight.supportingRecords, rows);
    assert.equal(insight.painPoint, rows[0].analysis.painPoint);
    assert.deepEqual(aggregateInsights(rows), aggregateInsights([...rows].reverse()));
});
test('controlled reset theme groups missing-email paraphrases and preserves the original evidence', () => {
    const rows = resetParaphrases.map((painPoint, i) => row(i + 2, { painPoint }));
    const [insight] = aggregateInsights(rows);
    assert.equal(insight.count, 3);
    assert.equal(insight.title, 'Account Access: Password Reset Failure');
    assert.deepEqual(insight.supportingRecords, rows);
});
test('unrelated Account Access issues and ambiguous or negated failures stay separate', () => {
    const issues = ['Password reset link expired', 'Verification code missing', 'Account locked after repeated login errors', 'No login errors prevented access', 'Login errors resolved successfully', 'Password reset email did not arrive and login errors blocked access'];
    const rows = [...loginParaphrases.slice(0, 2), ...resetParaphrases.slice(0, 2), ...issues].map((painPoint, i) => row(i + 2, { painPoint }));
    const insights = aggregateInsights(rows);
    assert.equal(insights.length, 2);
    assert.deepEqual(insights.map(i => i.count), [2, 2]);
    assert.deepEqual(insights.map(i => i.supportingRecords.map(r => r.record)), [[2, 3], [4, 5]]);
});
test('semantic normalization never crosses category boundaries', () => {
    assert.deepEqual(aggregateInsights([row(2, { painPoint: loginParaphrases[0] }), row(3, { category: 'Website', painPoint: loginParaphrases[1] })]), []);
    const insights = aggregateInsights([row(2), row(3), row(4, { category: 'Website' }), row(5, { category: 'Website' })]);
    assert.equal(insights.length, 2);
    assert.deepEqual(insights.map(i => i.count), [2, 2]);
});
test('semantic groups calculate counts from valid records and exclude failed or positive-only groups', () => {
    const rows = loginParaphrases.map((painPoint, i) => row(i + 2, { painPoint, sentiment: i === 2 ? 'Neutral' : 'Negative', effort: i === 1 ? 'Low' : 'High', priority: i === 0 ? 'High' : 'Low' }));
    const [insight] = aggregateInsights([...rows, { ...row(8, { painPoint: loginParaphrases[0] }), error: 'Failed' }, row(9, { painPoint: loginParaphrases[1], effort: 'Invalid' })]);
    assert.equal(insight.count, 3);
    assert.equal(insight.negativePercent, 67);
    assert.equal(insight.highEffort, 2);
    assert.equal(insight.highPriority, 1);
    assert.deepEqual(insight.supportingRecords, rows);
    assert.deepEqual(aggregateInsights(rows.map(r => ({ ...r, analysis: { ...r.analysis, sentiment: 'Positive' } }))), []);
});
