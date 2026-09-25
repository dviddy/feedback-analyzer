const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { summarize } = require('../../browser');
const analysis = { category: 'Cards', sentiment: 'Negative', effort: 'High', priority: 'High', painPoint: '<img src=x onerror=alert(1)>', recommendedAction: '<script>alert(1)</script>' };
function ui() {
    const root = path.join(__dirname, '../..');
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { runScripts: 'outside-only' });
    for (const file of ['analysis-contract.js', 'journey-mapping.js', 'semantic-trends.js', 'browser.js']) dom.window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
    dom.window.Papa = require('papaparse');
    return dom;
}
test('dashboard counts only successful results and groups controlled categories', () => {
    const counts = summarize([{ analysis }, { error: 'failed' }, undefined, { analysis: { ...analysis, sentiment: 'Neutral', priority: 'Low' } }]);
    assert.equal(counts.total, 2);
    assert.equal(counts.failed, 1);
    assert.equal(counts.negative, 1);
    assert.equal(counts.neutral, 1);
    assert.equal(counts.highPriority, 1);
    assert.equal(counts.categories.get('Cards'), 2);
});
test('single UI prevents overlapping runs, renders text safely and clears stale results on failure', async () => {
    const dom = ui();
    try {
        const w = dom.window;
        w.document.getElementById('feedback').value = 'Example';
        let resolve;
        let calls = 0;
        w.fetch = () => { calls++; return new Promise(done => { resolve = done; }); };
        const pending = w.analyzeSingleFeedback();
        assert.equal(w.document.getElementById('csvButton').disabled, true);
        await w.analyzeSingleFeedback();
        assert.equal(calls, 1);
        resolve({ ok: true, json: async () => ({ status: 'success', analysis }) });
        await pending;
        assert.equal(w.document.querySelectorAll('#analysis .feedback-card').length, 1);
        for (const value of Object.values(analysis)) assert.ok(w.document.getElementById('analysis').textContent.includes(value));
        assert.equal(w.document.querySelector('#analysis img, #analysis script'), null);
        assert.ok(w.document.getElementById('analysis').textContent.includes(analysis.painPoint));
        w.fetch = async () => ({ ok: false, json: async () => ({ message: 'Server unavailable' }) });
        await w.analyzeSingleFeedback();
        assert.equal(w.document.getElementById('analysis').textContent, '');
        assert.equal(w.document.getElementById('status').textContent, 'Server unavailable');
        assert.equal(w.document.getElementById('csvButton').disabled, false);
    } finally { dom.window.close(); }
});
test('CSV UI shows partial failures, progress and accurate counts; all-failure run has zero analyses', async () => {
    const dom = ui();
    try {
        const w = dom.window;
        Object.defineProperty(w.document.getElementById('csvFile'), 'files', { value: [{ size: 50, text: async () => 'feedback,id\nFirst,1\nSecond,2\n ,3' }] });
        let calls = 0;
        w.fetch = async () => ++calls === 1 ? { ok: true, json: async () => ({ status: 'success', analysis }) } : { ok: false, json: async () => ({ message: '<img src=x> failed' }) };
        await w.analyzeCSV();
        assert.match(w.document.getElementById('status').textContent, /1 succeeded; 1 failed; 1 blank/);
        assert.deepEqual([...w.document.querySelectorAll('.kpi-number')].map(node => node.textContent), ['1', '1', '0', '1']);
        assert.match(w.document.getElementById('analysis').textContent, /CSV record 3/);
        assert.equal(w.document.querySelector('#results img'), null);
        await w.analyzeCSV();
        assert.match(w.document.getElementById('status').textContent, /0 succeeded; 2 failed/);
        assert.equal(w.document.querySelector('.kpi-number').textContent, '0');
        assert.equal(w.document.getElementById('singleButton').disabled, false);
    } finally { dom.window.close(); }
});
test('served frontend loads local Papa Parse and completes a CSV through the real HTTP route', async () => {
    const { createApp } = require('../index');
    let calls = 0;
    const server = createApp({ client: { responses: { create: async () => {
        calls++;
        return { status: 'completed', output_text: JSON.stringify(analysis) };
    } } } }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    let dom;
    try {
        dom = await JSDOM.fromURL(base, { resources: 'usable', runScripts: 'dangerously', beforeParse(window) {
            // Node's fetch requires its own AbortSignal rather than jsdom's realm.
            window.AbortController = globalThis.AbortController;
            window.fetch = (url, options) => fetch(new URL(url, base), options);
        } });
        await new Promise(resolve => dom.window.addEventListener('load', resolve));
        assert.equal(typeof dom.window.Papa.parse, 'function');
        Object.defineProperty(dom.window.document.getElementById('csvFile'), 'files', { value: [{ size: 30, text: async () => 'feedback\n"Fast, helpful service"' }] });
        await dom.window.analyzeCSV();
        assert.equal(calls, 1, dom.window.document.getElementById('analysis').textContent);
        assert.match(dom.window.document.getElementById('status').textContent, /1 succeeded; 0 failed/);
        assert.equal(dom.window.document.querySelector('#analysis img'), null);
    } finally {
        dom?.window.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('emerging insights appear only after completion, expand safely, and clear on a new run', async () => {
    const dom = ui();
    try {
        const w = dom.window;
        const doc = w.document;
        Object.defineProperty(doc.getElementById('csvFile'), 'files', { value: [{ size: 100, text: async () => 'feedback\n"<img src=x> original"\nSecond\nFailure' }] });
        const pending = [];
        w.fetch = () => new Promise(resolve => pending.push(resolve));
        const run = w.analyzeCSV();
        await new Promise(resolve => setImmediate(resolve));
        pending[0]({ ok: true, json: async () => ({ status: 'success', analysis }) });
        pending[1]({ ok: true, json: async () => ({ status: 'success', analysis }) });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(doc.getElementById('emergingInsights').textContent, '');
        pending[2]({ ok: false, json: async () => ({ message: 'Failed' }) });
        await new Promise(resolve => setImmediate(resolve));
        pending[3]({ ok: true, json: async () => ({ status: 'success', result: { groups: [{ canonicalTrendName: 'Recurring card friction', description: 'Reported friction', records: [2, 3] }] } }) });
        await run;
        const section = doc.getElementById('emergingInsights');
        assert.equal(section.querySelectorAll('article').length, 1);
        assert.match(section.textContent, /2 supporting comments • 100% Negative • 2 High Effort • 2 High Priority/);
        const details = section.querySelector('details');
        assert.equal(details.open, false);
        details.querySelector('summary').click();
        assert.equal(details.open, true);
        assert.match(details.textContent, /CSV record 2/);
        assert.match(details.textContent, /CSV record 3/);
        assert.doesNotMatch(details.textContent, /CSV record 4/);
        assert.match(details.textContent, /<img src=x> original/);
        for (const field of Object.values(analysis)) assert.ok(details.textContent.includes(field));
        assert.equal(section.querySelector('img, script'), null);
        assert.equal(doc.querySelectorAll('#analysis > .insight').length, 3);
        assert.ok(section.compareDocumentPosition(doc.getElementById('analysis')) & w.Node.DOCUMENT_POSITION_FOLLOWING);
        doc.getElementById('feedback').value = 'Single';
        w.fetch = async () => ({ ok: true, json: async () => ({ status: 'success', analysis }) });
        await w.analyzeSingleFeedback();
        assert.equal(section.textContent, '');
        w.fetch = async () => ({ ok: false, json: async () => ({ message: 'Failed' }) });
        await w.analyzeCSV();
        assert.match(section.textContent, /No recurring trends/);
        assert.equal(section.querySelectorAll('article').length, 0);
    } finally { dom.window.close(); }
});

test('semantic insight cards display controlled titles and preserve each original pain point', () => {
    const dom = ui();
    try {
        const painPoints = [
            'Repeated login errors prevented the customer from accessing their account after three attempts.',
            'Repeated login errors prevented the member from accessing their account.',
            'The password reset email did not arrive, preventing access recovery.',
            'The password reset email did not arrive, preventing the customer from regaining account access.'
        ];
        dom.window.renderEmergingInsights(painPoints.map((painPoint, i) => ({ record: i + 2, feedback: `Original ${i + 2}`, analysis: { ...analysis, category: 'Account Access', painPoint } })));
        const cards = [...dom.window.document.querySelectorAll('.emerging-insight')];
        assert.deepEqual(cards.map(card => card.querySelector('h3').textContent), ['Account Access: Login Access Failure', 'Account Access: Password Reset Failure']);
        for (const card of cards) assert.match(card.textContent, /2 supporting comments • 100% Negative • 2 High Effort • 2 High Priority/);
        for (const [i, painPoint] of painPoints.entries()) {
            const support = cards[Math.floor(i / 2)].querySelector('details').textContent;
            assert.ok(support.includes(painPoint));
            assert.ok(support.includes(`CSV record ${i + 2}`));
        }
    } finally { dom.window.close(); }
});

test('journeys follow insights, expand original evidence safely, and explain absent stages', () => {
    const dom = ui();
    try {
        const w = dom.window;
        const doc = w.document;
        const rows = [2, 3].map(record => ({ record, feedback: '<img src=x> Original login complaint', analysis: { ...analysis, category: 'Account Access', painPoint: 'Login errors prevented account access.' } }));
        rows.push({ record: 7, feedback: 'Unmapped original', analysis });
        w.renderJourneyMaps(rows);
        const section = doc.getElementById('journeyMaps');
        assert.ok(doc.getElementById('emergingInsights').compareDocumentPosition(section) & w.Node.DOCUMENT_POSITION_FOLLOWING);
        assert.ok(section.compareDocumentPosition(doc.getElementById('analysis')) & w.Node.DOCUMENT_POSITION_FOLLOWING);
        assert.equal(section.querySelectorAll('.journey').length, 1);
        assert.equal(section.querySelectorAll('.journey-stage').length, 5);
        assert.match(section.textContent, /does not indicate success, satisfaction, or journey health/);
        const auth = section.querySelectorAll('.journey-stage')[1];
        assert.deepEqual([...auth.querySelectorAll('.stage-status')].map(node => node.textContent), ['Attention Needed', 'High Friction']);
        assert.equal(auth.querySelector('.stage-statuses').textContent, 'Attention Needed\nHigh Friction');
        const statusStyle = w.getComputedStyle(auth.querySelector('.stage-statuses'));
        assert.equal(statusStyle.flexDirection, 'column');
        assert.equal(statusStyle.gap, '8px');
        assert.match(auth.textContent, /2 supporting comments • 100% Negative • 2 High Effort • 2 High Priority/);
        const details = auth.querySelector('details');
        assert.equal(details.open, false);
        details.querySelector('summary').click();
        assert.equal(details.open, true);
        assert.match(details.textContent, /Emerging Insight: Account Access: Login Access Failure/);
        for (const row of rows.slice(0, 2)) {
            assert.ok(details.textContent.includes(`CSV record ${row.record}`));
            assert.ok(details.textContent.includes(row.feedback));
            for (const value of Object.values(row.analysis)) assert.ok(details.textContent.includes(value));
        }
        assert.match(section.querySelector('.journey-unmapped').textContent, /Unmapped \(1\).*CSV record 7.*Unmapped original/s);
        assert.equal(section.querySelector('img, script'), null);
    } finally { dom.window.close(); }
});

test('CSV journeys require user action after semantic enrichment and clear for every new run', async () => {
    const dom = ui();
    try {
        const w = dom.window;
        const doc = w.document;
        const file = { size: 40, text: async () => 'feedback\nFirst\nSecond' };
        Object.defineProperty(doc.getElementById('csvFile'), 'files', { value: [file] });
        const pending = [];
        w.fetch = () => new Promise(resolve => pending.push(resolve));
        const run = w.analyzeCSV();
        await new Promise(resolve => setImmediate(resolve));
        const response = { ok: true, json: async () => ({ status: 'success', analysis: { ...analysis, category: 'Account Access', painPoint: 'Login access failure' } }) };
        pending[0](response);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(doc.getElementById('journeyMaps').textContent, '');
        pending[1](response);
        await new Promise(resolve => setImmediate(resolve));
        pending[2]({ ok: true, json: async () => ({ status: 'success', result: { groups: [{ canonicalTrendName: 'Login Access Failure', description: 'Login failures', records: [2, 3] }] } }) });
        await run;
        assert.equal(pending.length, 3);
        assert.equal(doc.getElementById('journeyMaps').textContent, '');
        assert.equal(doc.querySelector('#journeyControls button').disabled, true);
        [...doc.querySelectorAll('#journeyControls button')].find(b => b.textContent === 'Select Trends').click();
        const checkbox = doc.querySelector('#journeyControls input'); checkbox.checked = true;
        const generated = w.generateJourneyMaps([checkbox.value]);
        assert.equal(pending.length, 4);
        pending[3]({ ok: true, json: async () => ({ status: 'success', result: { classifications: [{ trendId: checkbox.value, journey: 'Digital Account Access', reason: 'Access failures', assignments: [2, 3].map(record => ({ record, stage: 'Authenticate', reason: 'Login failed' })) }] } }) });
        await generated;
        assert.match(doc.getElementById('journeyMaps').textContent, /Digital Account Access/);
        file.text = async () => 'invalid';
        await w.analyzeCSV();
        assert.equal(doc.getElementById('journeyMaps').textContent, '');
        w.renderJourneyMaps([{ record: 2, feedback: 'Old feedback', analysis }]);
        doc.getElementById('feedback').value = 'New single feedback';
        w.fetch = async () => response;
        await w.analyzeSingleFeedback();
        assert.equal(doc.getElementById('journeyMaps').textContent, '');
        file.text = async () => 'feedback\nFailure';
        w.fetch = async () => ({ ok: false, json: async () => ({ message: 'Failed' }) });
        await w.analyzeCSV();
        assert.equal(doc.getElementById('journeyMaps').textContent, '');
        assert.equal(doc.querySelectorAll('.journey').length, 0);
    } finally { dom.window.close(); }
});

test('every journey numbers its stages sequentially, including after expanded nested evidence', () => {
    const dom = ui();
    try {
        const { exactRules, taxonomy } = require('../../journey-mapping');
        dom.window.renderJourneyMaps(exactRules.map((rule, i) => ({ record: i + 2, feedback: 'Original', analysis: { ...analysis, category: rule.category, painPoint: rule.phrases[0] } })));
        const journeys = [...dom.window.document.querySelectorAll('.journey')];
        assert.equal(journeys.length, Object.keys(taxonomy).length);
        for (const journey of journeys) {
            const list = journey.querySelector('.journey-stages');
            assert.equal(list.tagName, 'OL');
            const items = [...list.children];
            assert.deepEqual(items.map(item => item.value), items.map((_, index) => index + 1));
            assert.deepEqual(items.map(item => item.querySelector('h4').textContent), taxonomy[journey.querySelector('h3').textContent]);
            journey.querySelector('summary').click();
            assert.deepEqual(items.map(item => item.value), items.map((_, index) => index + 1));
        }
    } finally { dom.window.close(); }
});

test('Emerging Insight DOM preserves normal punctuation without introducing HTML entities', () => {
    const dom = ui();
    try {
        const painPoint = 'Repeated login errors prevented access — member’s account.';
        const recommendedAction = 'Review “R & I” logs <carefully>.';
        dom.window.renderEmergingInsights([2, 3].map(record => ({ record, feedback: 'Original', analysis: { ...analysis, category: 'Account Access', painPoint, recommendedAction } })));
        const card = dom.window.document.querySelector('.emerging-insight');
        const summaries = [...card.querySelectorAll(':scope > p > span')];
        assert.deepEqual(summaries.map(node => node.textContent), [painPoint, recommendedAction]);
        assert.doesNotMatch(card.textContent, /&(?:amp|lt|gt|quot|#\d+|#x[\da-f]+);/i);
        assert.equal(card.querySelector('carefully'), null);
    } finally { dom.window.close(); }
});

test('V2 accessible table exposes ten dimensions, safe evidence, provenance and empty states', () => {
    const dom = ui();
    try {
        const input = [2, 3].map(record => ({ record, feedback_id: `<id-${record}>`, feedback: 'I am frustrated. The login screen failed.', analysis: { ...analysis, category: 'Account Access', painPoint: 'Login access failure' } }));
        dom.window.renderJourneyMaps(input);
        const doc = dom.window.document;
        const table = doc.querySelector('.journey-table');
        assert.match(table.caption.textContent, /CURRENT-STATE JOURNEY MAP/);
        assert.equal(table.querySelectorAll('thead th[scope="col"]').length, 6);
        const rows = [...table.querySelectorAll('tbody tr')];
        assert.equal(rows.length, 10);
        assert.deepEqual(rows.map(r => r.querySelector('th').textContent), ['Member Action', 'Touchpoint / Channel', 'Pain Point', 'Member Emotion', 'Supporting Evidence', 'Member Effort', 'Priority', 'Current-State Insight', 'Proposed Future-State Solution', 'Owner / Assignment']);
        assert.match(rows[4].children[2].textContent, /2 supporting comments • 100% Negative • 2 High Effort • 2 High Priority/);
        assert.match(rows[3].children[2].textContent, /Explicitly detected from feedback/);
        assert.match(rows[4].children[2].textContent, /feedback_id: <id-2>/);
        assert.match(rows[4].children[2].textContent, /Mapping:/);
        assert.match(rows[8].children[2].textContent, /Proposed recommendations/);
        assert.match(rows[8].children[1].textContent, /No evidence-based recommendation/);
        assert.equal(rows[9].children[2].textContent, 'Unassigned');
        assert.match(doc.querySelector('.journey').textContent, /Persona not defined/);
        assert.equal(table.querySelector('script, img, id-2'), null);
        const details = rows[4].children[2].querySelector('details');
        details.querySelector('summary').click();
        assert.equal(details.open, true);
        assert.equal(table.parentElement.tabIndex, 0);
        assert.equal(dom.window.getComputedStyle(table.parentElement).overflowX, 'auto');
    } finally { dom.window.close(); }
});

test('Top 3 button maps candidates only, prevents duplicate calls, and preserves maps on retryable failure', async () => {
    const dom = ui();
    try {
        const w = dom.window; const doc = w.document;
        Object.defineProperty(doc.getElementById('csvFile'), 'files', { value: [{ size: 100, text: async () => 'feedback\nOne\nTwo\nThree\nFour\nFive' }] });
        const calls = [];
        w.fetch = async (url, options) => {
            calls.push(url);
            if (url === '/analyze') return { ok: true, json: async () => ({ status: 'success', analysis }) };
            if (url === '/trends') return { ok: true, json: async () => ({ status: 'success', result: { groups: [{ canonicalTrendName: 'Card failure', description: 'Declines', records: [2, 3, 4] }, { canonicalTrendName: 'Other issue', description: 'Other', records: [5, 6] }] } }) };
            const payload = JSON.parse(options.body); assert.equal(payload.trends.length, 1);
            return { ok: true, json: async () => ({ status: 'success', result: { classifications: [{ trendId: payload.trends[0].trendId, journey: 'Cards', reason: 'Card authorization', assignments: [2, 3, 4].map(record => ({ record, stage: 'Authorization', reason: 'Declined' })) }] } }) };
        };
        await w.analyzeCSV();
        assert.equal(calls.filter(c => c === '/journeys').length, 0);
        assert.equal(doc.getElementById('journeyMaps').textContent, '');
        doc.querySelector('#journeyControls button').click();
        doc.querySelector('#journeyControls button').click();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(calls.filter(c => c === '/journeys').length, 1);
        assert.equal(doc.querySelectorAll('.journey').length, 1);
        assert.doesNotMatch(doc.getElementById('journeyMaps').textContent, /CSV record 5/);
        const before = doc.getElementById('journeyMaps').textContent;
        w.fetch = async () => ({ ok: false, json: async () => ({ message: 'Try later' }) });
        await w.generateJourneyMaps(3);
        assert.match(doc.getElementById('journeyStatus').textContent, /failed.*Try later/);
        assert.equal(doc.getElementById('journeyMaps').textContent, before);
    } finally { dom.window.close(); }
});
test('failed semantic enrichment preserves dashboard and allows retry without repeating individual analyses', async () => {
    const dom = ui();
    try {
        const w = dom.window; const doc = w.document; let individualCalls = 0; let enrichCalls = 0;
        Object.defineProperty(doc.getElementById('csvFile'), 'files', { value: [{ size: 100, text: async () => 'feedback\nOne\nTwo' }] });
        w.fetch = async url => {
            if (url === '/analyze') { individualCalls++; return { ok: true, json: async () => ({ status: 'success', analysis }) }; }
            enrichCalls++;
            if (enrichCalls === 1) return { ok: false, json: async () => ({ message: 'Temporarily unavailable' }) };
            return { ok: true, json: async () => ({ status: 'success', result: { groups: [{ canonicalTrendName: 'Card issue', description: 'Recurring issue', records: [2, 3] }] } }) };
        };
        await w.analyzeCSV();
        assert.equal(doc.querySelector('.kpi-number').textContent, '2');
        assert.match(doc.getElementById('emergingInsights').textContent, /Top Trends unavailable/);
        doc.querySelector('#emergingInsights button').click();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(individualCalls, 2); assert.equal(enrichCalls, 2);
        assert.equal(doc.querySelectorAll('#emergingInsights article').length, 1);
        assert.equal(doc.getElementById('journeyMaps').textContent, '');
    } finally { dom.window.close(); }
});

test('redesigned shell labels inputs, exposes semantic sections and keeps details subordinate', () => {
    const dom = ui();
    try {
        const doc = dom.window.document;
        assert.equal(doc.documentElement.lang, 'en');
        assert.ok(doc.querySelector('meta[name="viewport"]'));
        assert.ok(doc.querySelector('main'));
        for (const id of ['feedback', 'csvFile']) {
            assert.ok(doc.querySelector(`label[for="${id}"]`));
            assert.ok(doc.getElementById(doc.getElementById(id).getAttribute('aria-describedby')));
        }
        assert.equal(doc.getElementById('status').getAttribute('aria-live'), 'polite');
        const sections = ['summary', 'emergingInsights', 'journeyControls', 'journeyMaps', 'feedbackDetails'];
        sections.slice(1).forEach((id, i) => assert.ok(doc.getElementById(sections[i]).compareDocumentPosition(doc.getElementById(id)) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING));
        dom.window.renderBatch([{ record: 2, analysis }], 1, 0);
        assert.equal(doc.querySelector('#summary h2').textContent, 'Executive Summary');
        const details = doc.getElementById('feedbackDetails');
        assert.equal(details.hidden, false);
        assert.equal(details.open, false);
        details.querySelector('summary').click();
        assert.equal(details.open, true);
        for (const value of Object.values(analysis)) assert.ok(details.textContent.includes(value));
        assert.equal(doc.querySelectorAll('.feedback-fields .badge').length, 3);
    } finally { dom.window.close(); }
});

test('loading shows actual CSV completion and safely presents configuration errors', async () => {
    const dom = ui();
    try {
        const w = dom.window; const doc = w.document;
        Object.defineProperty(doc.getElementById('csvFile'), 'files', { value: [{ size: 40, text: async () => 'feedback\nFirst\nSecond' }] });
        const pending = [];
        w.fetch = () => new Promise(resolve => pending.push(resolve));
        const run = w.analyzeCSV();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(doc.getElementById('analysisProgress').value, 0);
        assert.equal(doc.getElementById('analysisProgress').max, 2);
        assert.equal(doc.getElementById('statusPanel').dataset.tone, 'loading');
        pending[0]({ ok: true, json: async () => ({ status: 'success', analysis }) });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(doc.getElementById('analysisProgress').value, 1);
        assert.equal(doc.getElementById('analysisProgress').hidden, false);
        pending[1]({ ok: false, json: async () => ({ message: 'Set OPENAI_API_KEY on server.' }) });
        await run;
        assert.equal(doc.getElementById('analysisProgress').hidden, true);
        assert.doesNotMatch(doc.getElementById('analysis').textContent, /OPENAI_API_KEY/);
        doc.getElementById('feedback').value = 'Another comment';
        w.fetch = async () => ({ ok: false, json: async () => ({ message: 'Set OPENAI_API_KEY on server.' }) });
        await w.analyzeSingleFeedback();
        assert.equal(doc.getElementById('statusPanel').dataset.tone, 'error');
        assert.match(doc.getElementById('status').textContent, /administrator/);
    } finally { dom.window.close(); }
});

test('trends separate observed evidence and proposed focus; journey dimensions remain accessible', () => {
    const dom = ui();
    try {
        const w = dom.window; const doc = w.document;
        const rows = [2, 3].map(record => ({ record, feedback: 'I am frustrated. Login failed.', analysis: { ...analysis, category: 'Account Access', painPoint: 'Login access failure' } }));
        w.renderTopTrends([{ canonicalTrendName: 'Access issues', count: 2, negativePercent: 100, highEffortCount: 2, highPriorityCount: 2, percentAnalyzed: 100, description: 'Repeated login failures.', recommendedFocus: 'Review error recovery.', evidenceRecords: rows }]);
        assert.match(doc.querySelector('.observed').textContent, /Observed Experience/);
        assert.match(doc.querySelector('.recommendation').textContent, /Proposed/);
        assert.equal(doc.querySelector('.emerging-insight details').open, false);
        w.renderJourneyMaps(rows);
        assert.equal(doc.querySelectorAll('.journey-table .stage-number').length, 5);
        assert.equal(doc.querySelectorAll('.journey-table tbody tr').length, 10);
        assert.match(doc.querySelector('.opportunity-row').textContent, /Proposed Future-State Solution/);
        assert.match(doc.querySelector('.pain-row').textContent, /2 supporting comments/);
        assert.ok(doc.querySelector('.no-evidence'));
        for (const details of doc.querySelectorAll('#journeyMaps details')) assert.equal(details.open, false);
        assert.equal(w.getComputedStyle(doc.querySelector('.journey-table th')).position, 'sticky');
    } finally { dom.window.close(); }
});
