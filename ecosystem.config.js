module.exports = {
  apps: [{
    name: 'inbox-analyzer',
    script: 'server/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    max_memory_restart: '300M',
  }],
};
