const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../index');
const { schema, validateAnalysis } = require('../../analysis-contract');
const categories = ['Digital Banking', 'Mobile App', 'Website', 'Account Access', 'Transfers & Payments', 'Cards', 'Fees & Charges', 'Deposits & Accounts', 'Account Opening', 'Lending', 'Branch', 'Contact Center', 'Service Experience', 'Fraud & Security', 'Other'];
const analysis = { category: 'Cards', sentiment: 'Negative', effort: 'High', priority: 'High', painPoint: 'Card declined', recommendedAction: 'Review declines' };
async function withServer(client, run) {
    const server = createApp({ client }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const post = body => fetch(`http://127.0.0.1:${server.address().port}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try { await run(post); } finally { await new Promise(resolve => server.close(resolve)); }
}
test('contract accepts exactly six valid fields', () => {
    assert.deepEqual(validateAnalysis(analysis), analysis);
    for (const value of [null, [], {}, { ...analysis, action: 'legacy' }, { ...analysis, effort: 'Unknown' }, { ...analysis, painPoint: ' ' }, { ...analysis, category: 5 }]) assert.throws(() => validateAnalysis(value));
});
test('schema and validator enforce the exact category taxonomy', () => {
    assert.deepEqual(schema.properties.category.enum, categories);
    for (const category of categories) assert.equal(validateAnalysis({ ...analysis, category }).category, category);
    for (const category of ['Online Banking Access', 'Mobile App Performance', 'Card Decline', 'Account Transfers Usability', 'Website usability', 'cards', 'Cards ', '__proto__', '']) {
        assert.throws(() => validateAnalysis({ ...analysis, category }), /invalid result/);
    }
});
test('positive feedback keeps its category and effort does not dictate priority', () => {
    const positive = { ...analysis, category: 'Mobile App', sentiment: 'Positive', effort: 'Low', priority: 'Low', painPoint: 'No pain point identified.' };
    assert.deepEqual(validateAnalysis(positive), positive);
    for (const effort of ['Low', 'Medium', 'High']) {
        for (const priority of ['Low', 'Medium', 'High']) {
            assert.deepEqual(validateAnalysis({ ...analysis, effort, priority }), { ...analysis, effort, priority });
        }
    }
});
test('API validates input before calling provider and uses strict schema', async () => {
    let calls = 0;
    await withServer({ responses: { create: async request => {
        calls++;
        assert.equal(request.text.format.strict, true);
        assert.deepEqual(request.text.format.schema.properties.category.enum, categories);
        for (const category of categories) assert.ok(request.instructions.includes(category));
        assert.match(request.instructions, /Use painPoint for the specific issue/);
        assert.match(request.instructions, /For positive feedback, keep the appropriate category/);
        assert.match(request.instructions, /Low:.*accomplished the task easily, quickly/);
        assert.match(request.instructions, /Medium:.*did not clearly require substantial repeated effort or multiple recovery actions/);
        assert.match(request.instructions, /High:.*repeated attempts.*multiple contacts.*multiple channels.*repeated failures.*rework.*locked out.*unable to complete an important task.*significant troubleshooting.*excessive or confusing steps.*restart a process/);
        assert.match(request.instructions, /blocked task combined with repeated attempts should generally be High effort/);
        assert.match(request.instructions, /Repeated failures, repeated attempts, excessive\/confusing steps, rework, or an inability to complete the intended task should generally be classified as High effort/);
        for (const [feedback, effort] of [
            ['I tried logging in three times and still received an error.', 'High'],
            ['The app repeatedly freezes when I try to check my balance.', 'High'],
            ['The application was confusing and had too many steps.', 'High'],
            ['I had to call twice and then visit a branch.', 'High'],
            ['I had to restart the process.', 'High'],
            ['I could not complete the task after repeated attempts.', 'High'],
            ['I had trouble finding where to transfer money, but eventually figured it out.', 'Medium'],
            ['The instructions were somewhat unclear.', 'Medium'],
            ['I experienced a short delay.', 'Medium'],
            ['The fee was unexpected and confusing.', 'Medium unless resolving it required additional significant effort.'],
            ['It was quick and easy.', 'Low'],
            ['The representative helped me immediately.', 'Low']
        ]) assert.ok(request.instructions.includes(`"${feedback}" → ${effort}`));
        assert.match(request.instructions, /A negative outcome does not automatically mean High effort/);
        assert.match(request.instructions, /A card being declined once may be Medium effort even if its business priority is High/);
        assert.match(request.instructions, /Priority must remain separate from effort/);
        assert.equal(request.store, false);
        assert.equal(request.input, 'Card declined');
        return { status: 'completed', output_text: JSON.stringify(analysis) };
    } } }, async post => {
        for (const feedback of [null, '', '  ', 42, {}, 'x'.repeat(10001)]) assert.equal((await post({ feedback })).status, 400);
        assert.equal(calls, 0);
        const response = await post({ feedback: ' Card declined ' });
        assert.deepEqual(await response.json(), { status: 'success', analysis });
        assert.equal(calls, 1);
    });
});
test('API rejects malformed, incomplete and invalid model output', async () => {
    for (const response of [{ status: 'completed', output_text: 'not JSON' }, { status: 'incomplete', output_text: JSON.stringify(analysis) }, { status: 'completed', output_text: '{}' }, { status: 'completed', output_text: '' }]) {
        await withServer({ responses: { create: async () => response } }, async post => assert.equal((await post({ feedback: 'test' })).status, 502));
    }
});
test('API rejects an invented category rather than returning fragmented analytics', async () => {
    await withServer({ responses: { create: async () => ({ status: 'completed', output_text: JSON.stringify({ ...analysis, category: 'Card Decline' }) }) } }, async post => {
        const response = await post({ feedback: 'My debit card declined.' });
        assert.equal(response.status, 502);
        assert.equal((await response.json()).status, 'error');
    });
});
test('API reports missing configuration, rate limit, timeout and provider failure safely', async () => {
    await withServer(undefined, async post => assert.equal((await post({ feedback: 'test' })).status, 503));
    for (const [error, status] of [[{ status: 429 }, 429], [{ name: 'APIConnectionTimeoutError' }, 504], [new Error('PRIVATE CUSTOMER TEXT'), 502]]) {
        await withServer({ responses: { create: async () => { throw error; } } }, async post => {
            const response = await post({ feedback: 'test' });
            assert.equal(response.status, status);
            assert.ok(!(await response.text()).includes('PRIVATE'));
        });
    }
});
test('Express serves only frontend assets and /health; secrets and samples are inaccessible', async () => {
    const server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const page = await fetch(base);
        assert.match(page.headers.get('content-type'), /text\/html/);
        assert.match(await page.text(), /Feedback Intelligence/);
        assert.equal((await (await fetch(`${base}/health`)).json()).status, 'success');
        for (const asset of ['/browser.js', '/analysis-contract.js', '/vendor/papaparse.min.js']) assert.equal((await fetch(base + asset)).status, 200);
        for (const secret of ['/server/.env', '/.env', '/server/index.js', '/Member%20Feedback%20500.csv', '/app.js', '/server/node_modules/openai/package.json']) assert.equal((await fetch(base + secret)).status, 404);
        const malformed = await fetch(`${base}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
        assert.equal(malformed.status, 400);
        assert.equal((await malformed.json()).status, 'error');
        const oversized = await fetch(`${base}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: 'x'.repeat(70000) }) });
        assert.equal(oversized.status, 413);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
