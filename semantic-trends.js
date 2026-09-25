/* Semantic labels come from the model; all metrics and opportunity rules come from code. */
(function (root) {
    const contract = typeof module !== 'undefined' && module.exports ? require('./analysis-contract') : root.AnalysisContract;
    const journeys = typeof module !== 'undefined' && module.exports ? require('./journey-mapping') : root.JourneyMapping;
    const defaults = Object.freeze({ recurringCount: 2, candidateCount: 3, negativeFraction: 0.5, highEffortCount: 2, highPriorityCount: 2,
        weights: Object.freeze({ count: 1, negativeCount: 1, highEffortCount: 1, highPriorityCount: 1 }) });
    const limits = Object.freeze({ records: 1000, characters: 180000 });
    function eligible(outcomes) {
        const seen = new Set();
        return outcomes.filter(row => {
            if (!row || row.error || row.excluded === true || !Number.isInteger(row.record) || row.record < 2 || seen.has(row.record)) return false;
            try { contract.validateAnalysis(row.analysis); } catch { return false; }
            if (typeof row.feedback !== 'string' || !row.feedback.trim()) return false;
            seen.add(row.record); return true;
        }).sort((a, b) => a.record - b.record);
    }
    function inputs(outcomes) {
        return eligible(outcomes).map(row => ({ record: row.record, feedback_id: row.feedback_id || '', feedback: row.feedback,
            category: row.analysis.category, painPoint: row.analysis.painPoint }));
    }
    const object = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
    const string = { type: 'string' };
    const trendSchema = object({ groups: { type: 'array', items: object({ canonicalTrendName: string, description: string,
        records: { type: 'array', items: { type: 'integer' } } }) } });
    const journeySchema = object({ classifications: { type: 'array', items: object({ trendId: string,
        journey: { type: ['string', 'null'], enum: [...Object.keys(journeys.taxonomy), null] },
        reason: string, assignments: { type: 'array', items: object({ record: { type: 'integer' },
            stage: { type: ['string', 'null'], enum: [...new Set(Object.values(journeys.taxonomy).flat()), null] }, reason: string }) } }) } });
    function keys(value, expected) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...expected].sort().join()) throw new Error('Invalid enrichment structure.');
    }
    function prose(value) { if (typeof value !== 'string' || !value.trim() || value.length > 1200) throw new Error('Invalid enrichment text.'); }
    function partition(ids, expected) {
        if (ids.length !== expected.length || new Set(ids).size !== ids.length || ids.some(id => !expected.includes(id))) throw new Error('Enrichment evidence identifiers do not match.');
    }
    function validateGroups(result, records) {
        keys(result, ['groups']);
        if (!Array.isArray(result.groups)) throw new Error('Invalid groups.');
        const ids = [];
        for (const group of result.groups) {
            keys(group, ['canonicalTrendName', 'description', 'records']);
            prose(group.canonicalTrendName); prose(group.description);
            if (!Array.isArray(group.records) || !group.records.length) throw new Error('Empty trend.');
            ids.push(...group.records);
        }
        partition(ids, records.map(row => row.record));
        return result;
    }
    function frequencies(rows, field) {
        const counts = new Map();
        for (const row of rows) counts.set(row.analysis[field], (counts.get(row.analysis[field]) || 0) + 1);
        return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([text, count]) => ({ text, count }));
    }
    function buildTrends(outcomes, enrichment, config = defaults) {
        const rows = eligible(outcomes);
        validateGroups(enrichment, rows);
        const byId = new Map(rows.map(row => [row.record, row]));
        return enrichment.groups.filter(group => group.records.length >= config.recurringCount).map(group => {
            const evidenceRecords = group.records.map(id => byId.get(id)).sort((a, b) => a.record - b.record);
            const count = evidenceRecords.length;
            const tally = (field, value) => evidenceRecords.filter(row => row.analysis[field] === value).length;
            const trend = { trendId: `trend-${evidenceRecords.map(row => row.record).join('-')}`, canonicalTrendName: group.canonicalTrendName,
                description: group.description, categories: [...new Set(evidenceRecords.map(row => row.analysis.category))].sort(),
                supportingRecordIds: evidenceRecords.map(row => row.record), supportingFeedbackIds: evidenceRecords.flatMap(row => row.feedback_id ? [row.feedback_id] : []),
                count, supportingCount: count, negativeCount: tally('sentiment', 'Negative'), neutralCount: tally('sentiment', 'Neutral'), positiveCount: tally('sentiment', 'Positive'),
                highEffortCount: tally('effort', 'High'), mediumEffortCount: tally('effort', 'Medium'), lowEffortCount: tally('effort', 'Low'), highPriorityCount: tally('priority', 'High'),
                recommendedActions: frequencies(evidenceRecords, 'recommendedAction'), dominantPainPoints: frequencies(evidenceRecords, 'painPoint'), evidenceRecords };
            trend.percentAnalyzed = Math.round(100 * count / rows.length);
            trend.negativePercent = Math.round(100 * trend.negativeCount / count);
            trend.recommendedFocus = trend.recommendedActions[0].text;
            trend.candidate = count >= config.candidateCount && trend.positiveCount < count &&
                (trend.negativeCount / count >= config.negativeFraction || trend.highEffortCount >= config.highEffortCount || trend.highPriorityCount >= config.highPriorityCount);
            trend.rank = Object.entries(config.weights).reduce((sum, [key, weight]) => sum + trend[key] * weight, 0);
            return trend;
        }).sort((a, b) => b.rank - a.rank || b.count - a.count || a.supportingRecordIds[0] - b.supportingRecordIds[0]);
    }
    function selectTrends(trends, selection) {
        return typeof selection === 'number' ? trends.filter(trend => trend.candidate).slice(0, selection) : trends.filter(trend => selection.includes(trend.trendId));
    }
    function validateClassifications(result, trends) {
        keys(result, ['classifications']);
        if (!Array.isArray(result.classifications)) throw new Error('Invalid journey classifications.');
        partition(result.classifications.map(c => c.trendId), trends.map(t => t.trendId));
        for (const c of result.classifications) {
            keys(c, ['trendId', 'journey', 'reason', 'assignments']); prose(c.reason);
            if (c.journey !== null && !Object.hasOwn(journeys.taxonomy, c.journey)) throw new Error('Invalid controlled journey.');
            if (!Array.isArray(c.assignments)) throw new Error('Invalid stage assignments.');
            const trend = trends.find(t => t.trendId === c.trendId);
            partition(c.assignments.map(a => a.record), trend.supportingRecordIds);
            for (const a of c.assignments) {
                keys(a, ['record', 'stage', 'reason']); prose(a.reason);
                if (a.stage !== null && (!c.journey || !journeys.taxonomy[c.journey].includes(a.stage))) throw new Error('Invalid controlled stage.');
            }
        }
        return result;
    }
    function projectTrend(trend, classification) {
        validateClassifications({ classifications: [classification] }, [trend]);
        const assignments = new Map(classification.assignments.map(a => [a.record, a]));
        const projection = journeys.buildJourneyMaps(trend.evidenceRecords, { selectedJourney: classification.journey,
            insights: [{ title: trend.canonicalTrendName, supportingRecords: trend.evidenceRecords }],
            unmappedReason: row => `${classification.journey ? 'Unmapped within journey' : 'Journey not identified'}: ${assignments.get(row.record).reason}`,
            classify: row => {
                const assignment = assignments.get(row.record);
                return classification.journey && assignment.stage ? { journey: classification.journey, stage: assignment.stage, reason: `Semantic classification: ${assignment.reason}` } : null;
            } });
        for (const row of [...projection.unmapped, ...projection.journeys.flatMap(journey => journey.stages.flatMap(stage => stage.supportingRecords))]) row.semanticTrend = trend.canonicalTrendName;
        return projection;
    }
    const api = { defaults, limits, eligible, inputs, trendSchema, journeySchema, validateGroups, buildTrends, selectTrends, validateClassifications, projectTrend };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SemanticTrends = api;
})(globalThis);
