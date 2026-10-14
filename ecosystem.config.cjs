const path = require('node:path');
module.exports = {
  apps: [{
    name: 'relaydesk',
    cwd: __dirname,
    script: path.join(__dirname, 'scripts/start-production.mjs'),
    interpreter: process.execPath,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '768M',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 3000,
    kill_timeout: 10000,
    time: true,
    env: { NODE_ENV: 'production' },
  }],
};
