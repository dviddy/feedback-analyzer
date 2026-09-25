const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../index');
const password = 'synthetic-review-password-for-tests';
const authorization = 'Basic ' + Buffer.from(`reviewer:${password}`).toString('base64');
test('production fails closed without a strong reviewer password', () => {
    for (const password of ['', 'short']) assert.throws(() => createApp({ requireAuth: true, password }), /REVIEW_PASSWORD/);
});
test('hosted review protects assets and paid endpoints while allowing health checks', async () => {
    let calls = 0;
    const client = { responses: { create: async () => { calls++; throw new Error('stub'); } } };
    const server = createApp({ client, requireAuth: true, password }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        assert.equal((await fetch(base + '/health')).status, 200);
        for (const route of ['/', '/browser.js', '/analyze', '/trends', '/journeys']) {
            const response = await fetch(base + route);
            assert.equal(response.status, 401);
            assert.match(response.headers.get('www-authenticate'), /Basic/);
        }
        for (const route of ['/analyze', '/trends', '/journeys']) {
            assert.equal((await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
        }
        assert.equal(calls, 0);
        assert.equal((await fetch(base, { headers: { authorization: 'Basic invalid' } })).status, 401);
        assert.equal((await fetch(base, { headers: { authorization } })).status, 200);
        for (const route of ['/server/.env', '/.env', '/server/index.js', '/render.yaml']) {
            assert.equal((await fetch(base + route, { headers: { authorization } })).status, 404);
        }
        const post = origin => fetch(base + '/analyze', { method: 'POST', headers: { authorization, origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: 'Synthetic test comment' }) });
        assert.equal((await post('https://unrelated.example')).status, 403);
        assert.equal((await post('null')).status, 403);
        assert.equal(calls, 0);
        assert.equal((await post(base)).status, 502);
        assert.equal(calls, 1);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
