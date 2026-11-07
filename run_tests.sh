#!/usr/bin/env bash
set -e
echo "--- [Test Suite] Alpha Automated CLI Rejection & Whitelist Test ---"
node sync_alpha_storage.js
node validate_v4.0.3.js
echo "--- All Tests Passed Successfully ---"
