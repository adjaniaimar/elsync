module.exports = {
  apps: [
    {
      name: "elsync",
      script: "index.js",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};