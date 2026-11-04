const { validateTriadSchema } = require('./triad_schema_validator.js');

const mockDuplicatePayload = `
  0. SNAPSHOT
  System test payload.
  1. BOTTOM LINE
  First bottom line.
  1. BOTTOM LINE
  Duplicate bottom line.
  2. REASONING
  3. TELEMETRY & COMMANDS
  4. FRAMEWORK LENSES
  5. VISUALS & OPTIONS
  6. PREDICTIONS
  7. NEXT STEPS (1, 2, 3)
  8. RISKS & UNKNOWNS
  9. ASK ME NEXT
`;

console.log("--- [Test Suite] Testing Duplicate Header Rejection ---");
try {
  validateTriadSchema(mockDuplicatePayload);
  console.error("❌ FAIL: Duplicate payload was incorrectly accepted!");
  process.exit(1);
} catch (error) {
  if (error.message.includes("Duplicate sections detected")) {
    console.log("✅ PASS: Duplicate header successfully caught and rejected!");
    console.log("Error message output:", error.message);
  } else {
    console.error("❌ FAIL: Unexpected error thrown:", error.message);
    process.exit(1);
  }
}
