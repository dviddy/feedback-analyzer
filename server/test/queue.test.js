const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeComments } = require('../../browser');
test('queue limits concurrency, keeps row identity and continues after failure', async () => {
    let active = 0;
    let peak = 0;
    const progress = [];
    const comments = Array.from({ length: 9 }, (_, i) => ({ record: i + 2, feedback: String(i) }));
    const outcomes = await analyzeComments(comments, {
        analyze: async feedback => {
            active++;
            peak = Math.max(peak, active);
            await new Promise(resolve => setTimeout(resolve, feedback === '0' ? 20 : 2));
            active--;
            if (feedback === '1') throw new Error('busy');
            return { category: feedback };
        },
        onProgress: ({ completed }) => progress.push(completed)
    });
    assert.equal(peak, 3);
    assert.deepEqual(progress, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(outcomes.map(outcome => outcome.record), comments.map(comment => comment.record));
    assert.equal(outcomes[0].analysis.category, '0');
    assert.equal(outcomes[1].error, 'busy');
    assert.equal(outcomes.filter(outcome => outcome.analysis).length, 8);
});
test('queue handles empty input and rejects unsafe concurrency', async () => {
    assert.deepEqual(await analyzeComments([]), []);
    for (const concurrency of [0, -1, 4, NaN]) await assert.rejects(analyzeComments([], { concurrency }));
});
