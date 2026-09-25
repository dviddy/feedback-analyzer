const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../index');
const records = [2, 3].map(record => ({ record, feedback_id: `f${record}`, feedback: record === 2 ? 'ID rejected twice' : 'Three clear licence photos were rejected', category: 'Account Opening', painPoint: 'Verification failed' }));
const groups = { groups: [{ canonicalTrendName: 'Identity Verification Failure', description: 'Identity checks fail.', records: [2, 3] }] };
const selection = { trends: [{ trendId: 'trend-2-3', canonicalTrendName: 'Identity Verification Failure', records }] };
const classifications = { classifications: [{ trendId: 'trend-2-3', journey: 'Account Opening', reason: 'Identity check while opening', assignments: records.map(r => ({ record: r.record, stage: 'Verify Identity', reason: 'Rejected identity evidence' })) }] };
async function withServer(client, fn) {
    const server = createApp({ client }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const post = (route, body) => fetch(`http://127.0.0.1:${server.address().port}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try { await fn(post); } finally { await new Promise(resolve => server.close(resolve)); }
}
test('enrichment routes use one strict structured request each, minimal evidence and no metrics', async () => {
    const calls = [];
    await withServer({ responses: { create: async request => {
        calls.push(request);
        assert.equal(request.store, false); assert.equal(request.text.format.strict, true);
        assert.equal(request.max_output_tokens, 24000);
        assert.match(request.instructions, /untrusted evidence/);
        return { status: 'completed', output_text: JSON.stringify(calls.length === 1 ? groups : classifications) };
    } } }, async post => {
        assert.equal((await post('trends', { records })).status, 200);
        assert.equal(calls.length, 1);
        assert.deepEqual(JSON.parse(calls[0].input), { records });
        const response = await post('journeys', selection);
        assert.equal(response.status, 200); assert.deepEqual((await response.json()).result, classifications);
        assert.equal(calls.length, 2);
        assert.deepEqual(JSON.parse(calls[1].input), selection);
    });
});
test('invalid input, duplicate evidence, and batch bounds fail before provider calls', async () => {
    let calls = 0;
    await withServer({ responses: { create: async () => { calls++; } } }, async post => {
        for (const bad of [[], [records[0], records[0]], [{ ...records[0], category: 'invented' }], [{ ...records[0], feedback: '' }], Array.from({ length: 1001 }, (_, i) => ({ ...records[0], record: i + 2 })), Array.from({ length: 30 }, (_, i) => ({ ...records[0], record: i + 2, feedback: 'x'.repeat(9000) }))]) assert.equal((await post('trends', { records: bad })).status, 400);
        assert.equal((await post('journeys', { trends: [] })).status, 400);
        assert.equal((await post('journeys', { trends: [selection.trends[0], selection.trends[0]] })).status, 400);
        assert.equal(calls, 0);
    });
});
test('provider omissions, invented IDs/metrics/journeys, and cross-journey stages fail closed', async () => {
    for (const [route, payload, result] of [
        ['trends', { records }, { groups: [] }],
        ['trends', { records }, { groups: [{ ...groups.groups[0], records: [2, 99] }] }],
        ['trends', { records }, { groups: [{ ...groups.groups[0], negativePercent: 90 }] }],
        ['journeys', selection, { classifications: [{ ...classifications.classifications[0], journey: 'Invented' }] }],
        ['journeys', selection, { classifications: [{ ...classifications.classifications[0], journey: 'Cards' }] }],
        ['journeys', selection, { classifications: [] }]
    ]) await withServer({ responses: { create: async () => ({ status: 'completed', output_text: JSON.stringify(result) }) } }, async post => {
        assert.equal((await post(route, payload)).status, 502);
    });
});
test('enrichment handles missing configuration, incomplete responses, rate limits and timeouts safely', async () => {
    await withServer(undefined, async post => assert.equal((await post('trends', { records })).status, 503));
    for (const [error, expected] of [[{ status: 429 }, 429], [{ name: 'APIConnectionTimeoutError' }, 504], [new Error('PRIVATE'), 502]]) {
        await withServer({ responses: { create: async () => { throw error; } } }, async post => {
            const response = await post('trends', { records }); assert.equal(response.status, expected); assert.doesNotMatch(await response.text(), /PRIVATE/);
        });
    }
    await withServer({ responses: { create: async () => ({ status: 'incomplete', output_text: JSON.stringify(groups) }) } }, async post => assert.equal((await post('trends', { records })).status, 502));
});
