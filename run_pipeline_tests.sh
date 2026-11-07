#!/bin/bash

PROJECT_DIR="/data/data/com.termux/files/home/alpha"
cd "$PROJECT_DIR" || exit 1

echo "========================================="
date "+%Y-%m-%d %H:%M:%S"
echo "========================================="

echo "Generating mock data..."
python -c "
import json, random
mock_data = [{'id': i, 'value': random.randint(1, 100), 'status': 'pending'} for i in range(10)]
with open('mock_pipeline_input.json', 'w') as f:
    json.dump(mock_data, f, indent=4)
"

echo "Running test suite..."
pytest
PYTEST_EXIT_CODE=$?

if [ $PYTEST_EXIT_CODE -ne 0 ]; then
    termux-notification --title "❌ Pipeline Test Failed!" \
                        --content "Your Termux automated test suite encountered errors." \
                        --priority high \
                        --led-color red
else
    echo "✅ Tests passed successfully!"
fi
#!/bin/bash
PROJECT_DIR="/data/data/com.termux/files/home/alpha"
cd "$PROJECT_DIR" || exit 1


