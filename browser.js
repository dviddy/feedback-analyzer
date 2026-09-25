/* Plain JavaScript UI; all analyses come from the same backend. */
const contract = typeof module !== 'undefined' && module.exports ? require('./analysis-contract') : globalThis.AnalysisContract;
const labels = { category: 'Category', sentiment: 'Sentiment', effort: 'Effort', priority: 'Priority', painPoint: 'Pain Point', recommendedAction: 'Recommended Action' };
const journeyMapping = typeof module !== 'undefined' && module.exports ? require('./journey-mapping') : globalThis.JourneyMapping;
const semanticTrends = typeof module !== 'undefined' && module.exports ? require('./semantic-trends') : globalThis.SemanticTrends;
let busy = false;
let currentTrends = [];
let currentOutcomes = [];

async function requestAnalysis(feedback, fetchImpl = globalThis.fetch, timeoutMs = 65000) {
    if (typeof feedback !== 'string' || !feedback.trim() || feedback.length > contract.maxFeedbackLength) {
        throw new Error(`Enter feedback of 1–${contract.maxFeedbackLength} characters.`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl('/analyze', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback }), signal: controller.signal
        });
        let body;
        try { body = await response.json(); } catch { throw new Error('The server returned an unreadable response.'); }
        if (!response.ok) throw new Error(typeof body?.message === 'string' ? body.message : 'Analysis failed. Please try again.');
        if (body.status !== 'success') throw new Error('The server returned an invalid response.');
        return contract.validateAnalysis(body.analysis);
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Analysis timed out. Please try again.');
        if (error instanceof TypeError) throw new Error('Cannot reach the analysis server. Check that it is running.');
        throw error;
    } finally { clearTimeout(timer); }
}
function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}
function setBusy(value) {
    busy = value;
    for (const id of ['singleButton', 'csvButton', 'csvFile', 'feedback']) document.getElementById(id).disabled = value;
    document.getElementById('results').setAttribute('aria-busy', String(value));
    if (!value) {
        document.getElementById('analysisProgress').hidden = true;
        document.getElementById('singleButton').textContent = 'Analyze Comment';
        document.getElementById('csvButton').textContent = 'Analyze Dataset';
    }
}
// Presentation helpers never alter the analysis contract or derived metrics.
function displayError(message) {
    if (/OPENAI|API_KEY|provider|stack|schema|JSON|configuration/i.test(message)) return 'The analysis service is unavailable. Please try again or contact your administrator.';
    return message;
}
function setStatus(message, tone = 'info') {
    document.getElementById('status').textContent = message;
    const panel = document.getElementById('statusPanel');
    panel.hidden = !message;
    panel.dataset.tone = tone;
}
function showProgress(completed, total) {
    const progress = document.getElementById('analysisProgress');
    progress.hidden = false;
    if (total) { progress.max = total; progress.value = completed; }
    else progress.removeAttribute('value');
}
function showFeedback(expanded = false) {
    const details = document.getElementById('feedbackDetails');
    details.hidden = false;
    if (expanded) details.open = true;
}
function feedbackCard(analysis, title) {
    const card = element('article', undefined, 'insight feedback-card');
    if (title) card.append(element('strong', title));
    const fields = element('div', undefined, 'feedback-fields');
    for (const field of ['category', 'sentiment', 'effort', 'priority']) {
        fields.append(element('span', field === 'category' ? analysis[field] : `${labels[field]}: ${analysis[field]}`,
            field === 'category' ? 'field-category' : `badge badge-${field === 'sentiment' ? analysis[field].toLowerCase() : field + '-' + analysis[field].toLowerCase()}`));
    }
    const copy = element('div', undefined, 'feedback-copy');
    for (const field of ['painPoint', 'recommendedAction']) {
        const item = element('div');
        item.append(element('strong', labels[field]), element('p', analysis[field])); copy.append(item);
    }
    card.append(fields, copy); return card;
}
function trendMetrics(count, negative, effort, priority) {
    const metrics = element('div', undefined, 'trend-metrics');
    for (const [index, [value, label]] of [[count, 'supporting comments'], [negative + '%', 'Negative'], [effort, 'High Effort'], [priority, 'High Priority']].entries()) {
        if (index) metrics.append(document.createTextNode(' • '));
        const item = element('span'); item.append(element('strong', value), document.createTextNode(' ' + label)); metrics.append(item);
    }
    return metrics;
}
function experienceBlock(label, text, className) {
    const block = element('p', undefined, className);
    block.append(element('strong', label), element('span', text)); return block;
}
function clearResults() {
    document.getElementById('initialState').hidden = true;
    document.getElementById('feedbackDetails').hidden = true;
    document.getElementById('feedbackDetails').open = false;
    document.getElementById('analysis').replaceChildren();
    document.getElementById('summary').replaceChildren();
    document.getElementById('emergingInsights').replaceChildren();
    document.getElementById('journeyMaps').replaceChildren();
    document.getElementById('journeyControls').replaceChildren();
    currentTrends = []; currentOutcomes = [];
}
async function analyzeSingleFeedback() {
    if (busy) return;
    setBusy(true);
    clearResults();
    setStatus('Analyzing member feedback…', 'loading');
    document.getElementById('singleButton').textContent = 'Analyzing…';
    showProgress();
    try {
        const result = await requestAnalysis(document.getElementById('feedback').value);
        document.getElementById('analysis').append(feedbackCard(result, 'Comment assessment'));
        showFeedback(true);
        setStatus('Analysis complete.');
    } catch (error) { setStatus(displayError(error.message), 'error'); }
    finally { setBusy(false); }
}

function parseCSV(text, parser = globalThis.Papa) {
    const parsed = parser.parse(text, { delimiter: ',', skipEmptyLines: 'greedy' });
    if (parsed.errors.length) throw new Error('CSV could not be parsed. Check quotation marks and row formatting.');
    const [headers, ...rows] = parsed.data;
    if (!headers) throw new Error('The CSV file is empty.');
    const normalized = headers.map(header => header.replace(/^\uFEFF/, '').trim().toLowerCase());
    const indexes = normalized.flatMap((header, index) => header === 'feedback' ? [index] : []);
    if (indexes.length !== 1) throw new Error('CSV must contain exactly one column named feedback.');
    const comments = [];
    let skipped = 0;
    rows.forEach((row, index) => {
        if (row.length !== headers.length) throw new Error(`CSV record ${index + 2} has the wrong number of columns.`);
        const feedback = row[indexes[0]].trim();
        if (!feedback) { skipped++; return; }
        const idIndex = normalized.indexOf('feedback_id');
        comments.push({ feedback, record: index + 2, ...(idIndex >= 0 && row[idIndex].trim() ? { feedback_id: row[idIndex].trim() } : {}) });
    });
    if (!comments.length) throw new Error('The CSV contains no nonempty feedback.');
    return { comments, skipped };
}

async function analyzeComments(comments, { analyze = requestAnalysis, concurrency = 3, onProgress = () => {} } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw new Error('Concurrency must be between 1 and 3.');
    const outcomes = new Array(comments.length);
    let next = 0;
    let completed = 0;
    async function worker() {
        while (next < comments.length) {
            const index = next++;
            const comment = comments[index];
            try { outcomes[index] = { ...comment, analysis: await analyze(comment.feedback) }; }
            catch (error) { outcomes[index] = { record: comment.record, error: error.message || 'Analysis failed.' }; }
            completed++;
            onProgress({ completed, total: comments.length, outcomes });
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, comments.length) }, worker));
    return outcomes;
}
async function analyzeCSV() {
    if (busy) return;
    const file = document.getElementById('csvFile').files[0];
    if (!file) { setStatus('Please choose a CSV file first.', 'error'); return; }
    setBusy(true);
    clearResults();
    setStatus('Reading feedback dataset…', 'loading');
    document.getElementById('csvButton').textContent = 'Analyzing…';
    showProgress();
    try {
        if (file.size > 5 * 1024 * 1024) throw new Error('Choose a CSV file smaller than 5 MB.');
        const { comments, skipped } = parseCSV(await file.text());
        if (comments.length > 1000) throw new Error('Choose a CSV containing at most 1,000 nonempty comments.');
        renderBatch([], comments.length, skipped);
        showProgress(0, comments.length);
        const outcomes = await analyzeComments(comments, { onProgress: ({ completed, total, outcomes }) => {
            renderBatch(outcomes, total, skipped);
            setStatus(`Analyzing member feedback: ${completed} of ${total} comments complete…`, 'loading');
            showProgress(completed, total);
        } });
        currentOutcomes = outcomes;
        setStatus('Comments analyzed. Finding recurring experience trends…', 'loading');
        await enrichTrends();
        setStatus(`Analysis complete: ${outcomes.filter(outcome => outcome.analysis).length} succeeded; ${outcomes.filter(outcome => outcome.error).length} failed; ${skipped} blank feedback records skipped.`);
    } catch (error) { setStatus(displayError(error.message), 'error'); }
    finally { setBusy(false); }
}

async function requestEnrichment(route, payload) {
    if (JSON.stringify(payload).length > semanticTrends.limits.characters) throw new Error('Semantic enrichment exceeds the 180,000-character batch limit. Use a smaller CSV.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 65000);
    try {
        const response = await fetch('/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        const body = await response.json();
        if (!response.ok || body.status !== 'success') throw new Error(body.message || 'Enrichment failed.');
        return body.result;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Enrichment timed out. Please retry.');
        throw error;
    } finally { clearTimeout(timer); }
}
async function enrichTrends() {
    const section = document.getElementById('emergingInsights');
    section.replaceChildren(element('h2', 'Top Trends'), element('p', 'Finding recurring experience trends…'));
    try {
        const rows = semanticTrends.inputs(currentOutcomes);
        currentTrends = rows.length < semanticTrends.defaults.recurringCount ? [] : semanticTrends.buildTrends(currentOutcomes,
            await requestEnrichment('trends', { records: rows }));
        renderTopTrends(currentTrends);
        renderJourneyControls();
    } catch (error) {
        currentTrends = [];
        section.replaceChildren(element('h2', 'Top Trends'), element('p', `Top Trends unavailable: ${displayError(error.message)} Individual analysis and dashboard results are preserved.`));
        const retry = element('button', 'Retry Top Trends');
        retry.onclick = async () => { if (busy) return; setBusy(true); retry.disabled = true; try { await enrichTrends(); } finally { setBusy(false); } };
        section.append(retry);
    }
}
function renderTopTrends(trends) {
    const section = document.getElementById('emergingInsights');
    section.replaceChildren(element('h2', 'Top Trends'), element('p', 'Recurring experiences supported by at least two validated comments. Percentages are rounded; share uses all successfully analyzed, eligible feedback.'));
    if (!trends.length) section.append(element('p', 'No recurring trends found in successfully analyzed feedback.', 'empty-state'));
    for (const trend of trends) {
        const card = element('article', undefined, 'insight emerging-insight');
        card.append(element('h3', trend.canonicalTrendName),
            trendMetrics(trend.count, trend.negativePercent, trend.highEffortCount, trend.highPriorityCount),
            element('p', `${trend.percentAnalyzed}% of analyzed feedback`, 'trend-share'),
            experienceBlock('Observed Experience', trend.description, 'observed'),
            experienceBlock('Recommended Focus · Proposed', trend.recommendedFocus, 'recommendation'));
        if (trend.candidate) card.append(element('span', 'Journey Mapping Candidate', 'badge'));
        card.append(element('p', `Why this trend stands out: ${trend.count} supporting comments; ${trend.negativePercent}% negative; ${trend.highEffortCount} high-effort experiences; ${trend.highPriorityCount} high-priority experiences.`, 'metadata'));
        const details = element('details'); details.append(element('summary', `View supporting feedback (${trend.count})`));
        for (const row of trend.evidenceRecords) {
            const evidence = element('div', undefined, 'insight');
            evidence.append(element('strong', `CSV record ${row.record}`), element('p', row.feedback));
            if (row.feedback_id) evidence.append(element('p', `feedback_id: ${row.feedback_id}`));
            for (const field of contract.fields) evidence.append(element('div', `${labels[field]}: ${row.analysis[field]}`));
            details.append(evidence);
        }
        card.append(details); section.append(card);
    }
}
function renderJourneyControls() {
    const section = document.getElementById('journeyControls');
    const d = semanticTrends.defaults;
    section.replaceChildren(element('h2', 'Journey Mapping'), element('p', 'Generate journey maps for the experience trends you want to investigate further.'),
        element('p', `Recommended: Top 3. Product defaults: candidates need ${d.candidateCount} supporting comments and at least ${100 * d.negativeFraction}% negative, ${d.highEffortCount} high-effort records, or ${d.highPriorityCount} high-priority records. Positive-only trends require manual selection.`),
        element('p', 'Ranking adds supporting comments, negative comments, high-effort records, and high-priority records with equal weight. Ties use volume, then CSV order. These are configurable product defaults.'));
    const methodology = element('details');
    methodology.append(element('summary', 'How journey candidates are selected'));
    const descriptions = [...section.querySelectorAll('p')];
    descriptions.slice(1).forEach(paragraph => methodology.append(paragraph));
    section.append(methodology);
    for (const count of [3, 5]) {
        const button = element('button', `Generate Top ${count} Journey Maps`);
        button.disabled = !semanticTrends.selectTrends(currentTrends, count).length;
        button.onclick = () => generateJourneyMaps(count); section.append(button);
    }
    const select = element('button', 'Select Trends');
    const selection = element('fieldset'); selection.hidden = true; selection.id = 'trendSelection';
    select.setAttribute('aria-controls', 'trendSelection'); select.setAttribute('aria-expanded', 'false');
    selection.append(element('legend', 'Select recurring trends, including non-candidates'));
    for (const trend of currentTrends) {
        const label = element('label'); const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.value = trend.trendId;
        label.append(checkbox, document.createTextNode(trend.canonicalTrendName)); selection.append(label, element('br'));
    }
    const generate = element('button', 'Generate Journey Maps'); generate.disabled = !currentTrends.length;
    generate.onclick = () => generateJourneyMaps([...selection.querySelectorAll('input:checked')].map(input => input.value));
    selection.append(generate); select.onclick = () => { selection.hidden = !selection.hidden; select.setAttribute('aria-expanded', String(!selection.hidden)); };
    section.append(select, selection);
    const status = element('p'); status.id = 'journeyStatus'; status.setAttribute('role', 'status'); section.append(status);
}
async function generateJourneyMaps(selection) {
    if (busy) return;
    const selected = semanticTrends.selectTrends(currentTrends, selection);
    const status = document.getElementById('journeyStatus');
    if (!selected.length) { status.textContent = 'Select at least one recurring trend.'; return; }
    setBusy(true);
    const controls = [...document.querySelectorAll('#journeyControls button, #journeyControls input')];
    const disabled = controls.map(control => control.disabled); controls.forEach(control => { control.disabled = true; });
    status.textContent = `Generating journey maps for ${selected.length} selected trend(s)…`;
    try {
        const result = await requestEnrichment('journeys', { trends: selected.map(trend => ({ trendId: trend.trendId,
            canonicalTrendName: trend.canonicalTrendName, records: semanticTrends.inputs(trend.evidenceRecords) })) });
        semanticTrends.validateClassifications(result, selected);
        const projection = { journeys: [], unmapped: [], messages: [] };
        for (const trend of selected) {
            const classification = result.classifications.find(c => c.trendId === trend.trendId);
            const map = semanticTrends.projectTrend(trend, classification);
            projection.journeys.push(...map.journeys.map(journey => ({ ...journey, trendName: trend.canonicalTrendName })));
            projection.unmapped.push(...map.unmapped);
            projection.messages.push(`${trend.canonicalTrendName}: ${classification.journey || 'Journey not identified'} — ${classification.reason}`);
        }
        renderJourneyMaps([], projection);
        status.textContent = `Generated ${projection.journeys.length} journey map(s). ${projection.unmapped.length} supporting record(s) remain unmapped.`;
    } catch (error) { status.textContent = `Journey generation failed: ${displayError(error.message)} You can retry; any previously generated maps remain below.`; }
    finally { controls.forEach((control, index) => { control.disabled = disabled[index]; }); setBusy(false); }
}

// Exact fallback preserves words, negation, and numbers for unrecognized issues.
function normalizePainPoint(text) {
    return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function normalizeTheme(category, pain) {
    const fallback = { key: `exact:${pain}`, title: null };
    if (category !== 'Account Access') return fallback;
    // Reviewed phrase rules, not broad keyword similarity. Negated/resolved
    // failures and multi-issue descriptions stay on conservative exact matching.
    if (/\b(no|without|never)\b.{0,35}\b(errors?|failures?|failed|problems?)\b|\b(no longer|resolved|successfully)\b/.test(pain)) return fallback;
    if (/\b(mfa|2fa|verification|one time|security code|locked|lockout|fraud|username)\b/.test(pain)) return fallback;
    const reset = /\bpassword reset\b|\breset(?:ting)? (?:the |their |a )?password\b/.test(pain);
    const missingEmail = /\b(?:email|e mail)\b.{0,30}\b(?:did not arrive|didn t arrive|never arrived|not arriving|not received|not delivered|missing|failed to arrive)\b|\b(?:missing|undelivered) (?:password reset )?(?:email|e mail)\b|\b(?:did not|didn t|never|could not) receive(?:d)?\b.{0,30}\b(?:email|e mail)\b/.test(pain);
    const loginFailure = /\b(?:login|log in|sign in|signing in|logging in|authentication) (?:errors?|failures?|failed)\b|\b(?:unable to|cannot|can t|could not|couldn t) (?:log in|sign in|access (?:their |the |my )?account)\b|\b(?:failed|unsuccessful) (?:login|log in|sign in) attempts?\b/.test(pain);
    if (reset) {
        // Email delivery is distinct from invalid links or reset-form problems.
        if (missingEmail && !/\b(link|expired|invalid|form)\b/.test(pain) && !loginFailure) {
            return { key: 'theme:password-reset-email-failure', title: 'Password Reset Failure' };
        }
        return fallback;
    }
    if (loginFailure) return { key: 'theme:login-access-failure', title: 'Login Access Failure' };
    return fallback;
}
function aggregateInsights(outcomes) {
    const groups = new Map();
    const seenRecords = new Set();
    for (const outcome of outcomes) {
        if (!outcome || outcome.error || !Number.isInteger(outcome.record) || outcome.record < 2) continue;
        let analysis;
        try { analysis = contract.validateAnalysis(outcome.analysis); } catch { continue; }
        if (seenRecords.has(outcome.record)) continue;
        seenRecords.add(outcome.record);
        const pain = normalizePainPoint(analysis.painPoint);
        if (!pain || /^(none|n a|not applicable|no (issue|issues|pain point|pain points)( identified| reported)?)$/.test(pain)) continue;
        const theme = normalizeTheme(analysis.category, pain);
        const key = JSON.stringify([analysis.category, theme.key]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ record: outcome.record, feedback: outcome.feedback, analysis });
    }
    const insights = [];
    for (const [id, supportingRecords] of groups) {
        if (supportingRecords.length < 2 || supportingRecords.every(row => row.analysis.sentiment === 'Positive')) continue;
        // Reuse the most common action from non-positive evidence; ties use CSV order.
        supportingRecords.sort((a, b) => a.record - b.record);
        const evidence = supportingRecords.filter(row => row.analysis.sentiment !== 'Positive');
        const actions = new Map();
        for (const row of evidence) {
            const action = row.analysis.recommendedAction;
            actions.set(action, (actions.get(action) || 0) + 1);
        }
        const representative = evidence[0].analysis;
        const theme = normalizeTheme(representative.category, normalizePainPoint(representative.painPoint));
        const count = supportingRecords.length;
        insights.push({
            id,
            title: `${representative.category}: ${theme.title || (representative.painPoint.length > 90 ? representative.painPoint.slice(0, 87) + '…' : representative.painPoint)}`,
            count,
            negativePercent: Math.round(100 * supportingRecords.filter(row => row.analysis.sentiment === 'Negative').length / count),
            highEffort: supportingRecords.filter(row => row.analysis.effort === 'High').length,
            highPriority: supportingRecords.filter(row => row.analysis.priority === 'High').length,
            painPoint: representative.painPoint,
            recommendedFocus: [...actions].sort((a, b) => b[1] - a[1])[0][0],
            supportingRecords
        });
    }
    return insights.sort((a, b) => b.count - a.count || a.supportingRecords[0].record - b.supportingRecords[0].record);
}
function renderEmergingInsights(outcomes) {
    const section = document.getElementById('emergingInsights');
    section.replaceChildren(element('h2', 'Emerging Insights'), element('p', 'Related login failures and missing password-reset emails are grouped within Account Access. Other themes match category and pain-point wording. At least two validated comments are required; positive-only themes are omitted. Percentages are rounded within each theme.'));
    const insights = aggregateInsights(outcomes);
    if (!insights.length) section.append(element('p', 'No recurring pain-point themes found in successfully analyzed feedback.'));
    for (const insight of insights) {
        const card = element('article', undefined, 'insight emerging-insight');
        card.append(element('h3', insight.title),
            trendMetrics(insight.count, insight.negativePercent, insight.highEffort, insight.highPriority));
        for (const [label, text] of [['Observed Experience · Recurring pain point', insight.painPoint], ['Recommended Focus · Proposed', insight.recommendedFocus]]) {
            const paragraph = element('p', undefined, label.startsWith('Observed') ? 'observed' : 'recommendation');
            paragraph.append(element('strong', `${label}: `), element('span', text));
            card.append(paragraph);
        }
        card.append(element('p', 'Wording is taken from supporting analyses; the focus is the most common recommendation among non-positive comments.', 'metadata'));
        const details = element('details');
        details.append(element('summary', 'View supporting feedback'));
        for (const row of insight.supportingRecords) {
            const support = element('div', undefined, 'insight');
            support.append(element('strong', `CSV record ${row.record}`), element('p', row.feedback));
            for (const field of contract.fields) support.append(element('div', `${labels[field]}: ${row.analysis[field]}`));
            details.append(support);
        }
        card.append(details);
        section.append(card);
    }
}


function projectJourneys(outcomes) {
    return journeyMapping.buildJourneyMaps(outcomes, {
        insights: aggregateInsights(outcomes),
        resolveTheme: analysis => normalizeTheme(analysis.category, normalizePainPoint(analysis.painPoint))
    });
}
function journeyEvidence(records) {
    const details = element('details');
    details.append(element('summary', `View supporting feedback (${records.length})`));
    for (const row of records) {
        const support = element('div', undefined, 'insight');
        support.append(element('strong', `CSV record ${row.record}`),
            element('p', `Theme: ${row.theme}`),
            element('p', row.semanticTrend ? `Top Trend: ${row.semanticTrend}` : `Emerging Insight: ${row.emergingInsight || 'Not part of a recurring Emerging Insight'}`),
            element('p', row.feedback));
        for (const field of contract.fields) support.append(element('div', `${labels[field]}: ${row.analysis[field]}`));
        if (row.feedback_id !== undefined) support.append(element('p', `feedback_id: ${row.feedback_id}`));
        for (const emotion of row.emotions || []) support.append(element('p', `${emotion.label} — ${emotion.source}${emotion.wording ? `: “${emotion.wording}”` : ''}`));
        support.append(element('p', `Mapping: ${row.mappingReason}`));
        details.append(support);
    }
    return details;
}
function journeyTable(journey) {
    const wrapper = element('div', undefined, 'journey-table-scroll');
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', `${journey.name} current-state map; scroll to see all stages`);
    const table = element('table', undefined, 'journey-table');
    table.append(element('caption', `CURRENT-STATE JOURNEY MAP — ${journey.name}`));
    const head = element('thead');
    const header = element('tr');
    const corner = element('th', 'Experience dimension'); corner.scope = 'col'; header.append(corner);
    for (const [index, stage] of journey.stages.entries()) {
        const th = element('th'); th.scope = 'col';
        th.append(element('span', `STAGE ${String(index + 1).padStart(2, '0')}${index < journey.stages.length - 1 ? '  →' : ''}`, 'stage-number'),
            element('span', stage.name, 'stage-heading-name'));
        for (const status of stage.statuses) th.append(element('span', status, `stage-status ${status === 'High Friction' ? 'friction-status' : status === 'Attention Needed' ? 'attention-status' : ''}`), document.createTextNode(' '));
        header.append(th);
    }
    head.append(header); table.append(head);
    const body = element('tbody');
    const rows = ['Member Action', 'Touchpoint / Channel', 'Pain Point', 'Member Emotion', 'Supporting Evidence',
        'Member Effort', 'Priority', 'Current-State Insight', 'Proposed Future-State Solution', 'Owner / Assignment'];
    for (const label of rows) {
        const tr = element('tr', undefined, label === 'Proposed Future-State Solution' ? 'opportunity-row' : label === 'Pain Point' ? 'pain-row' : '');
        const th = element('th', label); th.scope = 'row'; tr.append(th);
        for (const stage of journey.stages) {
            const cell = element('td', undefined, !stage.count ? 'no-evidence' : '');
            const add = text => cell.append(element('p', text));
            if (label === 'Member Action') { add(stage.memberAction); add('Controlled definition'); }
            else if (label === 'Owner / Assignment') add(stage.solutions.length ? (stage.owner || 'Unassigned') : 'No evidence-based opportunity to assign');
            else if (!stage.count) add(label === 'Proposed Future-State Solution' ? 'No evidence-based recommendation' : journeyMapping.noEvidence);
            else if (label === 'Touchpoint / Channel') add(stage.touchpoints.join(' • ') || 'Not identified');
            else if (label === 'Pain Point') {
                if (!stage.painPoints.length) add('No qualifying pain point identified');
                for (const pain of stage.painPoints) {
                    add(`${pain.text} — ${pain.count} supporting comments`);
                    pain.descriptions.forEach(add);
                }
            } else if (label === 'Member Emotion') {
                const identified = stage.emotions.filter(emotion => emotion.source !== 'Unavailable');
                if (identified.length) {
                    add([...new Set(identified.map(emotion => emotion.label))].join(' • '));
                    const evidence = element('details');
                    evidence.append(element('summary', `View emotion evidence (${identified.length})`));
                    for (const emotion of identified) evidence.append(element('p', `${emotion.label} — ${emotion.source} (CSV record ${emotion.record}): “${emotion.wording}”`));
                    cell.append(evidence);
                }
                const unknown = stage.emotions.filter(emotion => emotion.source === 'Unavailable').length;
                if (unknown) add(`Emotion not identified — ${unknown} supporting comment(s); unavailable`);
            } else if (label === 'Supporting Evidence') {
                add(`${stage.count} supporting comments • ${stage.negativePercent}% Negative • ${stage.highEffort} High Effort • ${stage.highPriority} High Priority`);
                cell.append(journeyEvidence(stage.supportingRecords));
            } else if (label === 'Member Effort' || label === 'Priority') {
                const effort = label === 'Member Effort';
                for (const level of ['High', 'Medium', 'Low']) add(`${level} ${effort ? 'Effort' : 'Priority'}: ${(effort ? stage.effortCounts : stage.priorityCounts)[level]} of ${stage.count}`);
                if (effort && stage.highEffort) cell.append(element('span', 'High Friction', 'stage-status friction-status'));
                if (!effort && stage.highPriority) cell.append(element('span', 'Attention Needed', 'stage-status attention-status'));
            } else if (label === 'Current-State Insight') add(stage.currentState);
            else if (label === 'Proposed Future-State Solution') {
                add('Proposed recommendations — not validated solutions');
                for (const solution of stage.solutions) add(`${solution.text} — ${solution.count} supporting comment(s) (CSV records ${solution.records.join(', ')})`);
            }
            tr.append(cell);
        }
        body.append(tr);
    }
    table.append(body); wrapper.append(table); return wrapper;
}
function renderJourneyMaps(outcomes, projection) {
    const section = document.getElementById('journeyMaps');
    const { journeys, unmapped } = projection || projectJourneys(outcomes);
    section.replaceChildren(element('h2', projection ? 'Generated Journey Maps' : 'Journey Maps'), element('p',
        'Stages use controlled journey definitions. Counts include only supporting evidence for each map, including positive feedback when a stage is identifiable. No Feedback Observed means no qualifying evidence in this upload; it does not indicate success, satisfaction, or journey health.'));
    if (!journeys.length) section.append(element('p', 'No journey maps generated. No journey stages could be confidently mapped from the successfully analyzed feedback.', 'empty-state'));
    for (const journey of journeys) {
        const article = element('article', undefined, 'journey');
        const heading = element('div', undefined, 'journey-heading');
        heading.append(element('span', 'CURRENT-STATE JOURNEY MAP', 'eyebrow'));
        heading.append(element('h3', journey.trendName ? `${journey.trendName} — ${journey.name}` : journey.name), element('p', `Journey Goal: ${journey.goal}`, 'journey-goal'),
            element('p', `Persona / Member: ${journey.persona || 'Persona not defined'}`),
            element('p', 'Member actions describe controlled intended activity. Channels are explicit mentions in supporting feedback. Solutions are proposals from existing analyses, not observed outcomes.'),
            element('p', 'Scroll across to explore each stage. Proposed solutions are visually separated below.', 'metadata'));
        article.append(heading, journeyTable(journey));
        const stages = element('ol', undefined, 'journey-stages');
        for (const [stageIndex, stage] of journey.stages.entries()) {
            const item = element('li', undefined, 'journey-stage');
            item.value = stageIndex + 1;
            item.append(element('h4', stage.name));
            const statuses = element('div', undefined, 'stage-statuses');
            for (const status of stage.statuses) {
                if (statuses.childNodes.length) statuses.append(document.createTextNode('\n'));
                statuses.append(element('span', status, 'stage-status'));
            }
            item.append(statuses);
            if (stage.count) {
                item.append(element('p', `${stage.count} supporting comments • ${stage.negativePercent}% Negative • ${stage.highEffort} High Effort • ${stage.highPriority} High Priority`));
                const themes = element('ul', undefined, 'stage-themes');
                for (const theme of stage.themes) themes.append(element('li', theme));
                item.append(themes, journeyEvidence(stage.supportingRecords));
            }
            stages.append(item);
        }
        const legacy = element('details', undefined, 'journey-stage-detail');
        legacy.append(element('summary', 'Stage detail and mapping evidence'), stages);
        article.append(legacy);
        section.append(article);
    }
    const unassigned = element('article', undefined, 'journey-unmapped');
    unassigned.append(element('h3', `${projection ? 'Unmapped within journey / Journey not identified' : 'Unmapped'} (${unmapped.length})`), element('p',
        'Validated feedback without a confident stage match. Failed analyses are excluded and remain in individual results.'));
    if (unmapped.length) unassigned.append(journeyEvidence(unmapped));
    section.append(unassigned);
    for (const message of projection?.messages || []) section.append(element('p', message));
}

function summarize(outcomes) {
    const summary = { total: 0, failed: 0, negative: 0, positive: 0, neutral: 0, highPriority: 0, categories: new Map() };
    for (const outcome of outcomes) {
        if (!outcome) continue;
        if (outcome.error) { summary.failed++; continue; }
        const result = outcome.analysis;
        summary.total++;
        summary[result.sentiment.toLowerCase()]++;
        if (result.priority === 'High') summary.highPriority++;
        summary.categories.set(result.category, (summary.categories.get(result.category) || 0) + 1);
    }
    return summary;
}
function renderBatch(outcomes, total, skipped) {
    const counts = summarize(outcomes);
    const dashboard = element('div', undefined, 'dashboard');
    for (const [number, label] of [[counts.total, 'Comments Analyzed'], [counts.negative, 'Negative'], [counts.positive, 'Positive'], [counts.highPriority, 'High Priority']]) {
        const card = element('div', undefined, 'kpi');
        card.append(element('div', number, 'kpi-number'), element('div', label, 'kpi-label'));
        dashboard.append(card);
    }
    const charts = element('div', undefined, 'summary-charts');
    function distribution(title, entries) {
        const panel = element('div', undefined, 'distribution'); panel.append(element('h3', title));
        for (const [name, count] of entries) {
            const row = element('div', undefined, 'bar-row');
            const label = element('div', undefined, 'bar-label');
            label.append(element('span', name), element('span', `${count} comment${count === 1 ? '' : 's'}`));
            const track = element('div', undefined, 'bar-track'); track.setAttribute('aria-hidden', 'true');
            const fill = element('div', undefined, `bar-fill ${name.toLowerCase()}`);
            fill.style.width = `${counts.total ? 100 * count / counts.total : 0}%`; track.append(fill); row.append(label, track); panel.append(row);
        }
        if (!entries.length) panel.append(element('p', 'Categories will appear as feedback is analyzed.', 'metadata'));
        return panel;
    }
    charts.append(distribution('Sentiment overview', ['Negative', 'Positive', 'Neutral'].map(name => [name, counts[name.toLowerCase()]])),
        distribution('Feedback by category', [...counts.categories].sort((a, b) => b[1] - a[1])));
    document.getElementById('summary').replaceChildren(element('h2', 'Executive Summary'),
        element('p', 'A snapshot of successfully analyzed member and customer feedback.'), dashboard,
        element('p', `${counts.total + counts.failed} of ${total} complete • ${counts.failed} failed • ${total - counts.total - counts.failed} remaining • ${skipped} blank feedback records skipped`), charts);
    const cards = [];
    outcomes.forEach((outcome, index) => {
        if (!outcome) return;
        const title = `Comment ${index + 1} (CSV record ${outcome.record})`;
        const card = outcome.error ? element('div', undefined, 'insight feedback-card') : feedbackCard(outcome.analysis, title);
        if (outcome.error) card.append(element('strong', title), element('p', `Analysis failed: ${displayError(outcome.error)}`));
        cards.push(card);
    });
    document.getElementById('analysis').replaceChildren(...cards);
    showFeedback();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { requestAnalysis, parseCSV, analyzeComments, summarize, aggregateInsights, projectJourneys };
}
