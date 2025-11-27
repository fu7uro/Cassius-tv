// PM2 configuration for Cassius TV
module.exports = {
  apps: [
    {
      name: 'cassius-tv',
      script: 'npx',
      args: 'wrangler pages dev dist --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 3,
      min_uptime: '10s'
    }
  ]
}