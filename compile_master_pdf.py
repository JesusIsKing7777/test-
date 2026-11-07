'use strict';
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
import os

def generate_pdf():
    pdf_filename = "script_alpha_v92_master_compendium.pdf"
    doc = SimpleDocTemplate(pdf_filename, pagesize=letter,
                            rightMargin=54, leftMargin=54,
                            topMargin=54, bottomMargin=54)
    story = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Heading1'],
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=12,
        alignment=1
    )
    
    h2_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#0f2b46'),
        spaceBefore=14,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#333333'),
        spaceAfter=8
    )

    story.append(Paragraph("SCRIPT ALPHA v9.2 / DATAVERSE v5.5", title_style))
    story.append(Paragraph("Master Specification & Architectural Compendium", styles['Normal']))
    story.append(Spacer(1, 15))

    sections = [
        ("1. System Directive & Unified Spine", "Obeys the 8-section v9.2 Unified Spine, bottom-line first presentation, evidence tagging ([Verified], [Reported], [Inferred], [Unknown]), progressive disclosure tiers, and Cart 3 Ask-Before-Guessing entropy checks."),
        ("2. Master Storage Engine", "Features absolute path resolution (path.resolve()), monotonic nanosecond HRTime TTL stale lock reclamation, Write-Ahead Log (WAL) compaction, and SHA-256 HMAC manifest seals."),
        ("3. Telemetry & Bipartite Pipeline", "Routes atomic claim units into a 70% Verified Core and 30% Quarantine Drawer, backed by Prometheus metrics exposition on port 9101."),
        ("4. Test Suites & CI/CD Automation", "Includes 500-worker concurrency stress tests, ENOSPC fault-injection simulations, package.json script automation, and GitHub Actions CI matrix pipelines.")
    ]

    for title, desc in sections:
        story.append(Paragraph(title, h2_style))
        story.append(Paragraph(desc, body_style))

    doc.build(story)
    print(f"[SUCCESS] Master PDF compiled successfully: {pdf_filename}")

if __name__ == '__main__':
    generate_pdf()
