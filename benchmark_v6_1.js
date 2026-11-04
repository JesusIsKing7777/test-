const { DataversePipelineV5_1 } = require('./dataverse_pipeline_v5_1.js');
const pipeline = new DataversePipelineV5_1('benchmark_node');

const validTriadPayload = {
    '0. SNAPSHOT': 'Bench snapshot',
    '1. BOTTOM LINE': 'Bench bottom line',
    '2. REASONING': 'Bench reasoning',
    '3. TELEMETRY & COMMANDS': 'Bench telemetry',
    '4. FRAMEWORK LENSES': 'Bench lenses',
    '5. VISUALS & OPTIONS': 'Bench visuals',
    '6. PREDICTIONS': 'Bench predictions',
    '7. NEXT STEPS (1, 2, 3)': 'Bench next steps',
    '8. RISKS & UNKNOWNS': 'Bench risks',
    '9. ASK ME NEXT': 'Bench ask me next'
};

console.log('--- [Benchmark] Alpha v6.1 Mutation Throughput Test (5,000 Operations) ---');
const start = Date.now();
const iterations = 5000;

for (let i = 0; i < iterations; i++) {
    pipeline.mutate(`bench_key_${i}`, validTriadPayload);
}

const duration = Date.now() - start;
const opsPerSec = Math.round((iterations / (duration || 1)) * 1000);

console.log(`[Benchmark Results] Completed ${iterations} mutations in ${duration}ms.`);
console.log(`[Throughput] ${opsPerSec} mutations/second with active async batch validation.`);
