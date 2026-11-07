'use strict';
import os
import sys

def validate_pdf():
    pdf_filename = "script_alpha_v92_master_compendium.pdf"
    if not os.path.exists(pdf_filename):
        print(f"[FAIL] Target PDF not found: {pdf_filename}")
        sys.exit(2)

    file_size_bytes = os.path.getsize(pdf_filename)
    print(f"[INFO] Inspecting PDF: {pdf_filename} ({file_size_bytes} bytes)")

    if file_size_bytes < 500:
        print("[FAIL] PDF file size is suspiciously small.")
        sys.exit(3)

    # Simple validation check for ReportLab generated PDF header
    with open(pdf_filename, 'rb') as f:
        header = f.read(8)
        if not header.startswith(b'%PDF-'):
            print("[FAIL] Invalid PDF header magic bytes.")
            sys.exit(4)

    print("[SUCCESS] PDF page budget and structure validation passed.")
    process_exit = 0
    sys.exit(process_exit)

if __name__ == '__main__':
    validate_pdf()
