'use strict';
/**
 * PROMETHEUS ALERTMANAGER EXPRESS WEBHOOK RECEIVER
 * Ingests, parses, and logs firing/resolved alerts from Alertmanager.
 */
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.post('/api/v1/alerts', (req, res) => {
  const alertPayload = req.body;
  const timestamp = new Date().toISOString();

  console.log(`\n[WEBHOOK RECEIVED] at ${timestamp}`);
  console.log(`[RECEIVER] Group Key: ${alertPayload.groupKey || 'N/A'} | Status: ${alertPayload.status || 'N/A'}`);
  
  const alerts = alertPayload.alerts || [];
  console.log(`[ALERTS] Total alerts in batch: ${alerts.length}`);

  for (const alert of alerts) {
    const status = alert.status; // 'firing' or 'resolved'
    const labels = alert.labels || {};
    const annotations = alert.annotations || {};
    const startsAt = alert.startsAt;

    console.log(`  ----------------------------------------`);
    console.log(`  Alert Name : ${labels.alertname || 'Unknown'}`);
    console.log(`  Status     : ${status.toUpperCase()}`);
    console.log(`  Severity   : ${labels.severity || 'none'}`);
    console.log(`  Summary    : ${annotations.summary || 'No summary provided'}`);
    console.log(`  Details    : ${annotations.description || 'No description provided'}`);
    console.log(`  Starts At  : ${startsAt}`);
  }

  res.status(200).json({ status: 'success', receivedAlerts: alerts.length });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'HEALTHY', service: 'Alertmanager Webhook Receiver' });
});

app.listen(PORT, () => {
  console.log(`[RECEIVER] Webhook receiver listening at http://localhost:${PORT}/api/v1/alerts`);
});
