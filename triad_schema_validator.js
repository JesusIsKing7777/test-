const LEGACY_KEYS = ['1. BOTTOM LINE', '2. REASONING', '3. EFFICIENCY METRIC', '4. SUGGESTIVE NEXT STEPS'];

function validatePayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid payload: Must be an object.');
    }
    
    // Hard rejection for legacy 4-part keys
    const keys = Object.keys(payload);
    for (const key of keys) {
        if (LEGACY_KEYS.includes(key)) {
            throw new Error(`[SCHEMA VIOLATION]: Legacy payload key '${key}' is prohibited under TRIAD Master Schema.`);
        }
    }
    return true;
}

module.exports = { validatePayload };
