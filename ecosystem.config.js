module.exports = {
  apps : [{
    name: 'rari-fund-api-compound',
    script: 'index.js',

    // Options reference: https://pm2.keymetrics.io/docs/usage/application-declaration/
    // args: 'one two',
    // instances: 1,
    // autorestart: true,
    // watch: false,
    // max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      COMPOUND_APRS_SAVE_PATH: __dirname + '/compound-aprs.json'
    },
    env_production: {
      NODE_ENV: 'production',
      COMPOUND_APRS_SAVE_PATH: __dirname + '/compound-aprs.json'
    }
  }]
};
