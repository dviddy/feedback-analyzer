const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../../semantic-trends');
const { parseCSV } = require('../../browser');
const base = { category: 'Account Opening', sentiment: 'Negative', effort: 'High', priority: 'High', painPoint: 'Identity verification rejected my ID twice.', recommendedAction: 'Improve verification.' };
const row = (record, changes = {}) => ({ record, feedback_id: `f${record}`, feedback: `Original feedback ${record}`, analysis: { ...base, ...changes } });
const group = (records, canonicalTrendName = 'Identity Verification Failure') => ({ canonicalTrendName, description: 'Members cannot verify identity.', records });
const build = rows => T.buildTrends(rows, { groups: [group(rows.map(r => r.record))] });

test('semantic groups combine paraphrases, separate unrelated issues, and exclude singleton groups', () => {
    const rows = [row(2), row(3, { painPoint: 'The website rejected three clear driving licence photos during identity verification.' }), row(4, { painPoint: 'Initial deposit failed' })];
    const trends = T.buildTrends(rows, { groups: [group([2, 3]), group([4], 'Funding Failure')] });
    assert.equal(trends.length, 1);
    assert.deepEqual(trends[0].supportingRecordIds, [2, 3]);
    assert.equal(trends[0].percentAnalyzed, 67);
    assert.equal(trends[0].candidate, false);
    assert.deepEqual(trends[0].supportingFeedbackIds, ['f2', 'f3']);
    assert.deepEqual(trends[0].evidenceRecords, rows.slice(0, 2));
});
test('metrics, independent effort and priority counts, and ranking are deterministic', () => {
    const rows = [row(2), row(3, { sentiment: 'Neutral', effort: 'Medium', priority: 'Low' }), row(4, { sentiment: 'Positive', effort: 'Low', priority: 'Medium' })];
    const [trend] = build(rows);
    assert.deepEqual([trend.count, trend.negativeCount, trend.neutralCount, trend.positiveCount, trend.negativePercent, trend.highEffortCount, trend.mediumEffortCount, trend.lowEffortCount, trend.highPriorityCount], [3, 1, 1, 1, 33, 1, 1, 1, 1]);
    assert.equal(trend.candidate, false);
    assert.equal(trend.rank, 6);
    assert.deepEqual(build([...rows].reverse()), build(rows));
    assert.equal(trend.recommendedActions[0].count, 3);
});
test('candidate defaults cover volume, exact negative fraction, effort, priority, and positive-only exclusion', () => {
    assert.equal(build([row(2), row(3)])[0].candidate, false);
    assert.equal(build([row(2), row(3), row(4)])[0].candidate, true);
    const neutral = [2, 3, 4].map(id => row(id, { sentiment: 'Neutral', effort: 'Low', priority: 'Low' }));
    assert.equal(build(neutral)[0].candidate, false);
    neutral[0].analysis.effort = neutral[1].analysis.effort = 'High';
    assert.equal(build(neutral)[0].candidate, true);
    neutral.forEach(r => { r.analysis.effort = 'Low'; r.analysis.priority = 'High'; });
    assert.equal(build(neutral)[0].candidate, true);
    assert.equal(build([2, 3, 4].map(id => row(id, { sentiment: 'Positive' })))[0].candidate, false);
    const rows = [row(2), row(3), row(4, { sentiment: 'Neutral' }), row(5, { sentiment: 'Neutral' })].map(r => ({ ...r, analysis: { ...r.analysis, effort: 'Low', priority: 'Low' } }));
    assert.equal(build(rows)[0].candidate, true);
    assert.equal(T.buildTrends(rows, { groups: [group([2, 3, 4, 5])] }, { ...T.defaults, candidateCount: 5 })[0].candidate, false);
});
test('Top 3/5 selects only ranked candidates; manual selection includes positive recurring experiences', () => {
    const rows = Array.from({ length: 24 }, (_, i) => row(i + 2, i < 3 ? { sentiment: 'Positive' } : {}));
    const groups = Array.from({ length: 8 }, (_, i) => group([i * 3 + 2, i * 3 + 3, i * 3 + 4], `Experience ${i}`));
    const trends = T.buildTrends(rows, { groups });
    assert.deepEqual(T.buildTrends([...rows].reverse(), { groups: [...groups].reverse() }), trends);
    for (const n of [3, 5]) { const selected = T.selectTrends(trends, n); assert.equal(selected.length, n); assert.ok(selected.every(t => t.candidate)); }
    const positive = trends.find(t => t.positiveCount === 3);
    assert.deepEqual(T.selectTrends(trends, [positive.trendId]), [positive]);
    assert.deepEqual(T.selectTrends([positive], 3), []);
});
test('failed, invalid, blank, pending and explicitly excluded records cannot enter trends', () => {
    const valid = [row(2), row(3)];
    const rows = [...valid, valid[0], undefined, { ...row(4), error: 'failed' }, row(5, { category: 'Invented' }), { ...row(6), excluded: true }, { ...row(7), feedback: ' ' }];
    assert.deepEqual(T.inputs(rows).map(r => r.record), [2, 3]);
    assert.equal(T.buildTrends(rows, { groups: [group([2, 3])] })[0].percentAnalyzed, 100);
    for (const records of [[2], [2, 2], [2, 3, 9]]) assert.throws(() => T.buildTrends(rows, { groups: [group(records)] }));
    assert.throws(() => T.buildTrends(valid, { groups: [{ ...group([2, 3]), count: 90 }] }));
});
test('selected trend reuses V2 definitions, provenance, explicit emotions and absent-stage behavior', () => {
    const rows = [row(2), row(3)]; rows[0].feedback = 'I am frustrated. The website rejected my ID.';
    const trend = build(rows)[0];
    const c = { trendId: trend.trendId, journey: 'Account Opening', reason: 'New account verification', assignments: [{ record: 2, stage: 'Verify Identity', reason: 'ID rejected' }, { record: 3, stage: null, reason: 'Uncertain stage' }] };
    const projection = T.projectTrend(trend, c);
    const stage = projection.journeys[0].stages.find(s => s.name === 'Verify Identity');
    assert.equal(stage.count, 1);
    assert.equal(stage.supportingRecords[0].feedback_id, 'f2');
    assert.equal(stage.emotions[0].label, 'Frustrated');
    assert.equal(stage.provenance.memberAction, 'Controlled journey definition');
    assert.equal(stage.solutions[0].provenance, 'Proposed recommendation');
    assert.equal(projection.journeys[0].stages[0].currentState, 'No feedback evidence observed');
    assert.equal(projection.unmapped[0].record, 3);
    assert.throws(() => T.projectTrend(trend, { ...c, journey: 'Cards' }));
    const unknown = T.projectTrend(trend, { ...c, journey: null, assignments: c.assignments.map(a => ({ ...a, stage: null })) });
    assert.equal(unknown.journeys.length, 0); assert.equal(unknown.unmapped.length, 2);
});
test('40-record primary demo supports eight meaningful recurring trends through mocked semantic normalization', () => {
    const comments = parseCSV(fs.readFileSync(path.join(__dirname, '../../Journey Mapping Demo 40.csv'), 'utf8'), require('papaparse')).comments;
    assert.equal(comments.length, 40);
    // Mock model annotations, not production label rules. Live semantic output may differ.
    const pairs = [[1, 2, 'Login Access Failure'], [3, 4, 'Password Reset Failure'], [7, 8, 'Identity Verification Failure'], [13, 14, 'Transfer Confirmation Failure'], [19, 20, 'Unexpected Card Decline'], [25, 26, 'Loan Application Complexity'], [31, 32, 'Branch Wait Time'], [36, 37, 'Contact Center Hold Time']];
    const used = new Set(pairs.flatMap(([a, b]) => [a + 1, b + 1]));
    const groups = pairs.map(([a, b, name]) => group([a + 1, b + 1], name));
    const rows = comments.map(comment => ({ ...comment, analysis: { ...base, painPoint: comment.feedback } }));
    for (const r of rows) if (!used.has(r.record)) groups.push(group([r.record], `Other experience ${r.record}`));
    const trends = T.buildTrends(rows, { groups });
    assert.equal(trends.length, 8);
    for (const trend of trends) { assert.equal(trend.count, 2); assert.equal(trend.percentAnalyzed, 5); assert.equal(trend.evidenceRecords[0].feedback_id.startsWith('JM'), true); }
    assert.equal(T.selectTrends(trends, 3).length, 0, 'The demo pairs do not meet the default three-comment opportunity threshold');
});
