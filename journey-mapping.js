/* Controlled, deterministic journey projection. No provider calls or storage. */
(function (root) {
    const contract = typeof module !== 'undefined' && module.exports ? require('./analysis-contract') : root.AnalysisContract;
    const taxonomy = {
        'Digital Account Access': ['Attempt Access', 'Authenticate', 'Recover Access', 'Enter Account', 'Complete Intended Task'],
        'Account Opening': ['Discover', 'Start Application', 'Enter Information', 'Verify Identity', 'Fund Account', 'Complete Opening', 'Begin Using Account'],
        'Transfers & Payments': ['Find Transfer or Payment', 'Select Accounts or Recipient', 'Enter Details', 'Review', 'Authenticate or Confirm', 'Complete Transaction', 'Receive Confirmation'],
        'Cards': ['Receive or Activate Card', 'Attempt Transaction', 'Authorization', 'Complete Transaction', 'Manage Card', 'Resolve Card Issue'],
        'Lending': ['Explore Loan', 'Start Application', 'Enter Information', 'Submit Documentation', 'Underwriting or Review', 'Decision', 'Closing or Funding', 'Service Loan'],
        'Branch Service': ['Prepare for Visit', 'Arrive or Check In', 'Wait', 'Meet Employee', 'Complete Need', 'Follow Up'],
        'Contact Center': ['Identify Need', 'Find Contact Method', 'Connect or Wait', 'Authenticate', 'Explain Need', 'Resolve Need', 'Follow Up']
    };
    // Controlled definitions describe intended activity, never observed success.
    const goals = {
        'Digital Account Access': 'Access online banking successfully and complete the intended account task.',
        'Account Opening': 'Open an account and begin using it.',
        'Transfers & Payments': 'Transfer money or make a payment and confirm its completion.',
        'Cards': 'Activate, use, and manage a card.',
        'Lending': 'Apply for, obtain, and service a loan.',
        'Branch Service': 'Complete the intended service need at a branch.',
        'Contact Center': 'Contact support and resolve the intended service need.'
    };
    const actions = {
        'Attempt Access': 'Member attempts to access online banking.',
        'Authenticate': 'Member enters credentials and attempts authentication.',
        'Recover Access': 'Member attempts to regain account access.',
        'Enter Account': 'Member attempts to enter the account.',
        'Complete Intended Task': 'Member attempts to complete the intended account task.',
        'Discover': 'Member explores account options.',
        'Review': 'Member reviews the transaction details.',
        'Authorization': 'Member attempts to obtain authorization for a card transaction.',
        'Underwriting or Review': 'Member awaits review of the loan application.',
        'Decision': 'Member seeks a decision on the loan application.',
        'Closing or Funding': 'Member works through loan closing or funding.',
        'Service Loan': 'Member manages an existing loan.',
        'Wait': 'Member waits for branch service.',
        'Complete Need': 'Member attempts to complete the intended service need.',
        'Resolve Need': 'Member seeks resolution of the service need.',
        'Connect or Wait': 'Member attempts to connect with support or waits for assistance.'
    };
    const definitions = Object.fromEntries(Object.entries(taxonomy).map(([name, stages]) => [name, {
        goal: goals[name], persona: null,
        actions: Object.fromEntries(stages.map(stage => [stage, (name === 'Contact Center' && stage === 'Authenticate' ? 'Member attempts to verify identity with support.' : actions[stage]) || `Member attempts to ${stage.toLowerCase()}.`]))
    }]));
    const noEvidence = 'No feedback evidence observed';
    function deriveEmotion(feedback) {
        // Deliberately narrow: entire unquoted sentences with first-person feeling
        // statements. Negation, hypotheticals and third-person descriptions abstain.
        const emotions = [];
        if (typeof feedback !== 'string' || /["“”]/.test(feedback)) return [{ label: 'Emotion not identified', source: 'Unavailable', wording: null }];
        for (const sentence of (typeof feedback === 'string' ? feedback : '').split(/[.!\n]+/)) {
            const match = sentence.trim().match(/^I (?:am|was|feel|felt) (?:very |really |so )?(frustrated|confused|anxious|satisfied|relieved)$/i) ||
                sentence.trim().match(/^I'm (?:very |really |so )?(frustrated|confused|anxious|satisfied|relieved)$/i);
            if (match) emotions.push({ label: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(),
                source: 'Explicitly detected from feedback', wording: sentence.trim() });
        }
        return emotions.length ? emotions : [{ label: 'Emotion not identified', source: 'Unavailable', wording: null }];
    }
    function touchpoints(feedback) {
        // Report only explicit mentions; these are not assumed stage channels.
        const text = (typeof feedback === 'string' ? feedback : '').split(/[.!?\n]+/).filter(sentence =>
            !/\b(?:if|wish|hope|would|could|should|instead|rather|without|not)\b|never (?:use|used|visit|visited|call|called)|n['’]t|["“”]/i.test(sentence)).join('. ');
        return [['Website', /\bwebsite\b/i], ['Mobile App', /\bmobile app\b/i],
            ['Online Banking', /\bonline banking\b/i], ['Login Screen', /\blogin screen\b/i],
            ['Password Reset', /\bpassword reset\b/i], ['Email', /\be-?mail\b/i],
            ['Branch', /\bbranch\b/i], ['Contact Center', /\b(?:contact|call) cent(?:er|re)\b/i],
            ['Phone', /\bphone\b/i], ['Application', /\bapplication\b/i],
            ['Card / POS transaction', /\b(?:card transaction|point of sale|POS)\b/i]]
            .filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
    }
    function groupEvidence(records, value) {
        const groups = new Map();
        for (const row of records) {
            const text = value(row);
            if (!groups.has(text)) groups.set(text, { text, count: 0, records: [] });
            groups.get(text).count++;
            groups.get(text).records.push(row.record);
        }
        return [...groups.values()].sort((a, b) => b.count - a.count || a.records[0] - b.records[0]);
    }
    function stageExperience(records) {
        const pains = records.filter(row => row.analysis.sentiment !== 'Positive' &&
            !/^(none|n a|not applicable|no (issue|issues|pain point|pain points)( identified| reported)?)$/.test(normalize(row.analysis.painPoint)));
        const painPoints = groupEvidence(pains, row => row.emergingInsight || row.theme).map(group => ({ ...group,
            descriptions: [...new Set(pains.filter(row => group.records.includes(row.record)).map(row => row.analysis.painPoint))] }));
        const counts = field => Object.fromEntries(['High', 'Medium', 'Low'].map(level => [level, records.filter(row => row.analysis[field] === level).length]));
        return { painPoints, touchpoints: [...new Set(records.flatMap(row => row.touchpoints))],
            effortCounts: counts('effort'), priorityCounts: counts('priority'),
            emotions: records.flatMap(row => row.emotions.map(emotion => ({ ...emotion, record: row.record }))),
            currentState: !records.length ? noEvidence : painPoints.length ?
                `${painPoints[0].count} supporting comment(s) report “${painPoints[0].text}”. Reported experience: ${painPoints[0].descriptions[0]}` :
                `${records.length} supporting comment(s) observed at this stage; no qualifying pain point identified.`,
            solutions: groupEvidence(records, row => row.analysis.recommendedAction).map(solution => ({ ...solution,
                provenance: 'Proposed recommendation', userText: null })),
            owner: null, assignment: { owner: null, department: null, status: null, dueDate: null },
            provenance: { memberAction: 'Controlled journey definition', touchpoints: 'Observed feedback evidence: explicit channel mentions',
                painPoints: 'Observed feedback evidence: validated analyses', emotions: 'Explicit feedback wording or unavailable',
                evidence: 'Observed feedback evidence', effortCounts: 'Derived metric', priorityCounts: 'Derived metric',
                currentState: 'Deterministic summary of supporting analyses', solutions: 'Proposed recommendation',
                owner: 'User-entered field (not set)' } };
    }
    // Exact normalized theme keys from Emerging Insights; category is always required.
    const themeRules = [
        { category: 'Account Access', key: 'theme:login-access-failure', journey: 'Digital Account Access', stage: 'Authenticate' },
        { category: 'Account Access', key: 'theme:password-reset-email-failure', journey: 'Digital Account Access', stage: 'Recover Access' }
    ];
    // Small reviewed vocabulary for other stages. Match the WHOLE normalized
    // pain point, never a keyword in a mixed/ambiguous description. Unknown text
    // remains Unmapped. These rules do not change Emerging Insights grouping.
    const exactRules = [
        { category: 'Account Access', journey: 'Digital Account Access', stage: 'Authenticate', phrases: ['login access failure', 'successful login', 'easy login'] },
        { category: 'Account Access', journey: 'Digital Account Access', stage: 'Recover Access', phrases: ['password reset failure', 'successful password reset'] },
        { category: 'Account Opening', journey: 'Account Opening', stage: 'Verify Identity', phrases: ['identity verification failure', 'account opening identity verification failure'] },
        { category: 'Account Opening', journey: 'Account Opening', stage: 'Fund Account', phrases: ['initial account funding failure'] },
        { category: 'Transfers & Payments', journey: 'Transfers & Payments', stage: 'Receive Confirmation', phrases: ['missing payment confirmation', 'missing transfer confirmation'] },
        { category: 'Cards', journey: 'Cards', stage: 'Receive or Activate Card', phrases: ['card activation failure', 'quick card activation', 'card activation completed successfully'] },
        { category: 'Cards', journey: 'Cards', stage: 'Authorization', phrases: ['card authorization declined', 'debit card declined despite sufficient available funds'] },
        { category: 'Lending', journey: 'Lending', stage: 'Submit Documentation', phrases: ['loan document upload failure'] },
        { category: 'Lending', journey: 'Lending', stage: 'Decision', phrases: ['delayed loan decision'] },
        { category: 'Branch', journey: 'Branch Service', stage: 'Wait', phrases: ['long branch wait time', 'long branch wait times'] },
        { category: 'Contact Center', journey: 'Contact Center', stage: 'Connect or Wait', phrases: ['long call hold time', 'long call hold times'] }
    ];
    const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    // A direct description of branch staff interaction identifies only Meet Employee.
    // Match the entire statement so hypothetical, negated, and mixed-stage text
    // cannot acquire a match merely by mentioning staff. Sentiment is irrelevant.
    const employeeDescription = /^(?:(?:the|my|our) )?branch (?:staff|employees|tellers|employee|teller) (?:were|was) (?:not )?(?:friendly|helpful|polite|courteous|rude|unhelpful|unfriendly|dismissive)(?: and (?:not )?(?:friendly|helpful|polite|courteous|rude|unhelpful|unfriendly|dismissive))*$/;
    function branchEmployeeRule(analysis, feedback) {
        if (analysis.category !== 'Branch') return null;
        for (const [source, text] of [['pain point', analysis.painPoint], ['original feedback', feedback]]) {
            if (typeof text === 'string' && employeeDescription.test(normalize(text))) {
                return { category: 'Branch', journey: 'Branch Service', stage: 'Meet Employee',
                    reason: `explicit branch employee interaction in ${source}` };
            }
        }
        return null;
    }
    function mapStage(analysis, normalizedTheme, feedback) {
        return themeRules.find(rule => rule.category === analysis.category && rule.key === normalizedTheme?.key) ||
            exactRules.find(rule => rule.category === analysis.category && rule.phrases.includes(normalize(analysis.painPoint))) || branchEmployeeRule(analysis, feedback);
    }
    function stageMetrics(records) {
        const count = records.length;
        const highEffort = records.filter(row => row.analysis.effort === 'High').length;
        const highPriority = records.filter(row => row.analysis.priority === 'High').length;
        const statuses = count ? [
            ...(highPriority ? ['Attention Needed'] : []),
            ...(highEffort ? ['High Friction'] : []),
            ...(!highPriority && !highEffort ? ['Feedback Observed'] : [])
        ] : ['No Feedback Observed'];
        return { count, negativePercent: count ? Math.round(100 * records.filter(row => row.analysis.sentiment === 'Negative').length / count) : null,
            highEffort, highPriority, statuses, themes: [...new Set(records.map(row => row.theme))] };
    }
    function buildJourneyMaps(outcomes, { insights = [], resolveTheme = () => null, classify, selectedJourney, unmappedReason } = {}) {
        const seen = new Set();
        const assigned = new Map();
        if (selectedJourney && Object.hasOwn(taxonomy, selectedJourney)) assigned.set(selectedJourney, new Map());
        const unmapped = [];
        const insightByRecord = new Map();
        for (const insight of insights) for (const row of insight.supportingRecords) insightByRecord.set(row.record, insight.title);
        for (const outcome of outcomes) {
            if (!outcome || outcome.error || !Number.isInteger(outcome.record) || outcome.record < 2 || seen.has(outcome.record)) continue;
            let analysis;
            try { analysis = contract.validateAnalysis(outcome.analysis); } catch { continue; }
            seen.add(outcome.record);
            const normalizedTheme = resolveTheme(analysis);
            const rule = classify ? classify(outcome) : mapStage(analysis, normalizedTheme, outcome.feedback);
            const row = { record: outcome.record, feedback: outcome.feedback, analysis,
                ...(outcome.feedback_id !== undefined ? { feedback_id: outcome.feedback_id } : {}),
                emotions: deriveEmotion(outcome.feedback), touchpoints: touchpoints(outcome.feedback),
                theme: normalizedTheme?.title || analysis.painPoint,
                emergingInsight: insightByRecord.get(outcome.record) || null,
                mappingReason: rule ? `${analysis.category} + ${rule.reason || (rule.key ? normalizedTheme.title : `exact pain point “${analysis.painPoint}”`)} → ${rule.journey} → ${rule.stage}` : (unmappedReason ? unmappedReason(outcome) : 'No controlled category/theme rule identifies a stage confidently.') };
            if (!rule) { unmapped.push(row); continue; }
            if (!assigned.has(rule.journey)) assigned.set(rule.journey, new Map());
            const stages = assigned.get(rule.journey);
            if (!stages.has(rule.stage)) stages.set(rule.stage, []);
            stages.get(rule.stage).push(row);
        }
        const journeys = Object.entries(taxonomy).filter(([name]) => assigned.has(name)).map(([name, stages]) => ({ name, goal: definitions[name].goal, persona: definitions[name].persona, view: 'current-state',
            provenance: { goal: 'Controlled journey definition', persona: 'User-entered field (not set)' },
            stages: stages.map(nameOfStage => {
                const supportingRecords = (assigned.get(name).get(nameOfStage) || []).sort((a, b) => a.record - b.record);
                return { name: nameOfStage, memberAction: definitions[name].actions[nameOfStage],
                    ...stageMetrics(supportingRecords), ...stageExperience(supportingRecords), supportingRecords };
            })
        }));
        return { journeys, unmapped: unmapped.sort((a, b) => a.record - b.record) };
    }
    const api = { definitions, deriveEmotion, touchpoints, noEvidence, taxonomy, themeRules, exactRules, mapStage, buildJourneyMaps };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.JourneyMapping = api;
})(globalThis);
