const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:FOhJFhuffpGkWDRKivhRJKAvkkdOPLNf@hopper.proxy.rlwy.net:50136/railway',
  ssl: {
    rejectUnauthorized: false // Pour Railway
  }
});

// Tester la connexion
pool.connect((err, client, release) => {
  if (err) {
    console.error('Erreur de connexion à la BD:', err.stack);
  } else {
    console.log('✅ Connecté à PostgreSQL sur Railway');
    release();
  }
});

module.exports = pool;

