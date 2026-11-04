# Script Alpha & Dataverse v5.1 — Master Architecture & Deployment Specification

## 1. Executive Summary & Core Pillars
- **Framework:** Script Alpha & Dataverse v5.1[span_1](start_span)[span_1](end_span)
- **Interface Protocol:** Pure MX (Machine Experience) Single-Container Standard[span_2](start_span)[span_2](end_span)
- **Security Standard:** Zero-Custody Local Cryptographic Sealing (SHA-256 + Vector Clocks)[span_3](start_span)[span_3](end_span)

## 2. Implemented Modules
- `dataverse_v5_1_master.js`: Unified CRDT engine with IBAP entropy routing.
- `zero_custody_guard.js`: Local-first cryptographic hash verification.
- `auto_watcher.js`: Termux background telemetry daemon.

## 3. Storage & Telemetry Paths
- Audit Log: `~/alpha/telemetry check/audit_log.json`[span_4](start_span)[span_4](end_span)
- Internal Storage Mirror: `/sdcard/Alpha Up2date`[span_5](start_span)[span_5](end_span)
