const { DataversePipelineV5_1 } = require('./dataverse_pipeline_v5_1.js');
const pipeline = new DataversePipelineV5_1('test_cli_node');

console.log('--- [Test Suite] Alpha v6.1 Automated CLI Rejection & Whitelist Test ---');

// 1. Test Whitelist Bypass
try {
    pipeline.mutate('system_status', { active: true, version: 'Alpha v6.1' });
    console.log('✅ PASS: Whitelisted metadata key accepted successfully.');
} catch (e) {
    console.error('❌ FAIL: Whitelisted key rejected:', e.message);
    process.exit(1);
}

// 2. Test Invalid 4-Part Payload Rejection
const legacy4PartPayload = {
    '1. BOTTOM LINE': 'Legacy summary',
    '2. REASONING': 'Legacy reasoning',
    '3. EFFICIENCY METRIC': 'Legacy metric',
    '4. SUGGESTIVE NEXT STEPS': 'Legacy next steps'
};

let rejected = false;
try {
    pipeline.mutate('invalid_legacy_state', legacy4PartPayload);
} catch (e) {
    rejected = true;
    console.log('✅ PASS: Invalid legacy 4-part payload successfully caught and rejected.');
    console.log('   Error message output:', e.message);
}

if (!rejected) {
    console.error('❌ FAIL: Pipeline allowed invalid 4-part payload without throwing an error!');
    process.exit(1);
}

console.log('--- All CLI Rejection & Whitelist Tests Passed Successfully ---');
