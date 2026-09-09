const path = require('path');

const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'new-crm-api',
      cwd: path.join(ROOT, 'server'),
      script: 'index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      time: true,
      error_file: path.join(ROOT, 'logs', 'api-error.log'),
      out_file: path.join(ROOT, 'logs', 'api-out.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: 5002,
      },
    },
    {
      name: 'new-crm-web',
      cwd: ROOT,
      script: './node_modules/vite/bin/vite.js',
      args: 'preview --host 0.0.0.0 --port 3001',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      time: true,
      error_file: path.join(ROOT, 'logs', 'web-error.log'),
      out_file: path.join(ROOT, 'logs', 'web-out.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
