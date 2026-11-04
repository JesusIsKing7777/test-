const { DataverseCoreEngine } = require('./dataverse_v5_core.js');
const { validatePayload } = require('./triad_schema_validator.js');

class DataversePipelineV5_1 {
    constructor(nodeId) {
        this.engine = new DataverseCoreEngine(nodeId);
    }
    mutate(key, value) {
        // Enforce strict schema rejection
        if (typeof value === 'object' && value !== null) {
            validatePayload(value);
        }
        this.engine.set(key, value);
        console.log(`[DataversePipelineV5.1] State mutated: ${key} ->`, value);
    }
}

module.exports = { DataversePipelineV5_1 };
