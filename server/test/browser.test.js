const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requestAnalysis } = require('../../browser');
const analysis = { category: 'Cards', sentiment: 'Neutral', effort: 'Low', priority: 'Low', painPoint: 'No issue', recommendedAction: 'Maintain service' };
test('single comment posts to /analyze and validates result', async () => {
    const result = await requestAnalysis('hello', async (url, options) => {
        assert.equal(url, '/analyze');
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { feedback: 'hello' });
        return { ok: true, json: async () => ({ status: 'success', analysis }) };
    });
    assert.deepEqual(result, analysis);
});
test('single comment rejects blank input, network errors, server failures and invalid output', async () => {
    await assert.rejects(requestAnalysis(' ', () => assert.fail('must not call API')));
    await assert.rejects(requestAnalysis('test', async () => { throw new TypeError('network'); }), /Cannot reach/);
    await assert.rejects(requestAnalysis('test', async () => ({ ok: false, json: async () => ({ message: 'Service busy' }) })), /Service busy/);
    await assert.rejects(requestAnalysis('test', async () => ({ ok: true, json: async () => ({ status: 'success', analysis: {} }) })), /invalid result/);
    await assert.rejects(requestAnalysis('test', async () => ({ ok: true, json: async () => { throw new Error(); } })), /unreadable/);
});
test('single comment times out instead of falling back', async () => {
    await assert.rejects(requestAnalysis('test', (url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })));
    }), 5), /timed out/);
});
test('browser rejects categories outside the shared taxonomy', async () => {
    await assert.rejects(requestAnalysis('test', async () => ({
        ok: true,
        json: async () => ({ status: 'success', analysis: { ...analysis, category: 'Website usability' } })
    })), /invalid result/);
});
