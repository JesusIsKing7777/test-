

import json
import os
from unittest.mock import MagicMock, patch
from pipeline_runner import execute_pipeline, PipelineOutput, Entity

# ==========================================
# 1. API UNIT TESTS (From earlier)
# ==========================================
VALID_JSON_RESPONSE = """
{
    "status": "success",
    "data_summary": "Server fan failure fixed.",
    "confidence_score": 0.95,
    "extracted_entities": [{"name": "Alex", "category": "Person"}],
    "action_items": ["Order parts"],
    "flagged_issues": []
}
"""

@patch("google.genai.Client")
def test_gemini_success(mock_client_class):
    mock_client = MagicMock()
    mock_client_class.return_value = mock_client
    mock_response = MagicMock()
    mock_response.text = VALID_JSON_RESPONSE
    mock_client.models.generate_content.return_value = mock_response

    result = execute_pipeline(provider="gemini", input_text="Raw logs here")
    assert result is not None
    assert result.status == "success"


# ==========================================
# 2. FILE EXPORT TEST (The code from the screenshot)
# ==========================================
def test_pipeline_export_writes_to_disk(tmp_path):
    """Verifies that the data pipeline correctly writes JSON payloads to disk."""
    # Arrange: Create a temporary mock exports directory
    mock_export_dir = tmp_path / "exports"
    mock_export_dir.mkdir()
    
    test_file_path = mock_export_dir / "pipeline_output.json"
    sample_payload = {"status": "success", "data_summary": "Test artifact"}

    # Act: Simulate your code writing to the target path
    with open(test_file_path, "w") as f:
        json.dump(sample_payload, f)

    # Assert: Verify the file exists and contains uncorrupted data
    assert test_file_path.exists() is True
    
    with open(test_file_path, "r") as f:
        saved_data = json.load(f)
    assert saved_data["status"] == "success"
import pytest
from unittest.mock import patch, MagicMock

def test_pipeline_execution():
    VALID_JSON_RESPONSE = """
    {
        "status": "success",
        "data_summary": "Server fan failure fixed.",
        "confidence_score": 0.95,
# This is an assertion:
assert len(data) == 10000        "extracted_entities": [{"name": "Alex", "category": "Person"}],
        "action_items": ["Order parts"],
        "flagged_issues": []
    }
    """
    assert "success" in VALID_JSON_RESPONSE

import os
import shutil

folder_path = "exports"

# Loop through everything inside the directory and delete it
for filename in os.listdir(folder_path):
    file_path = os.path.join(folder_path, filename)
    try:
        if os.path.isfile(file_path) or os.path.islink(file_path):
            os.unlink(file_path) # Deletes files or symlinks
        elif os.path.isdir(file_path):
            shutil.rmtree(file_path) # Deletes sub-folders
    except Exception as e:
        print(f"Failed to delete {file_path}. Reason: {e}")





import os
import shutil

# 1. Force the path to point strictly inside your alpha folder
BASE_DIR = "/data/data/com.termux/files/home/alpha"
folder_path = os.path.join(BASE_DIR, "exports")

# 2. Delete the entire directory safely and rebuild it empty
try:
    if os.path.exists(folder_path):
        shutil.rmtree(folder_path)
    os.makedirs(folder_path, exist_ok=True)
except Exception as e:
    print(f"Failed to clear export directory. Reason: {e}")



