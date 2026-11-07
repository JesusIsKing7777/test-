module.exports = {
  apps: [
    {
      name: 'alpha-master-engine',
      script: './alpha_v8_3_master.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        ALPHA_TELEMETRY_HMAC_KEY: 'default-test-entropy-key-32-bytes-minimum!!'
      }
    },
    {
      name: 'alpha-prometheus-exporter',
      script: './alpha_prometheus_exporter.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        PORT: 9100
      }
    },
    {
      name: 'webhook-forwarder',
      script: './webhook_forwarder.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        PORT: 8080
      }
    },
    {
      name: 'health-check-monitor',
      script: './health_check_v7.js',
      instances: 1,
      autorestart: true,
      watch: false
    }
  ]
};
