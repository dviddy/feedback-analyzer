(function (root) {
    const fields = ['category', 'sentiment', 'effort', 'priority', 'painPoint', 'recommendedAction'];
    const enums = {
        category: [
            'Digital Banking', 'Mobile App', 'Website', 'Account Access',
            'Transfers & Payments', 'Cards', 'Fees & Charges', 'Deposits & Accounts',
            'Account Opening', 'Lending', 'Branch', 'Contact Center',
            'Service Experience', 'Fraud & Security', 'Other'
        ],
        sentiment: ['Positive', 'Neutral', 'Negative'],
        effort: ['Low', 'Medium', 'High'],
        priority: ['Low', 'Medium', 'High']
    };
    const schema = {
        type: 'object', additionalProperties: false, required: fields,
        properties: Object.fromEntries(fields.map(field => [field, enums[field] ? { type: 'string', enum: enums[field] } : { type: 'string' }]))
    };
    function validateAnalysis(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            Object.keys(value).length !== fields.length ||
            fields.some(field => !Object.hasOwn(value, field) || typeof value[field] !== 'string' ||
                !value[field].trim() || (enums[field] && !enums[field].includes(value[field])))) {
            throw new Error('The analysis service returned an invalid result.');
        }
        return Object.fromEntries(fields.map(field => [field, value[field].trim()]));
    }
    const contract = { fields, schema, validateAnalysis, maxFeedbackLength: 10000 };
    if (typeof module !== 'undefined' && module.exports) module.exports = contract;
    else root.AnalysisContract = contract;
})(globalThis);
