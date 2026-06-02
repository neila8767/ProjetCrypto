const pool = require('../config/db');

async function initDatabase() {
  try {
    // 1. Table Users , jai ajoute via terminial 3 attributs pour zineb
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_active BOOLEAN DEFAULT FALSE,
        otp_secret TEXT,
        quota BIGINT DEFAULT 1073741824,
        used_space BIGINT DEFAULT 0,
        activation_token VARCHAR(64),
         activation_expires TIMESTAMP,
     token_version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Table Users créée');

   

    // 3. Table Certificates// jai change ca aussi 
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Certificates (
        id SERIAL PRIMARY KEY,
        user_id INT UNIQUE REFERENCES Users(id) ON DELETE CASCADE,
        public_key TEXT NOT NULL,
        signature TEXT NOT NULL,
        version VARCHAR(10),
        public_key_hash TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Table Certificates créée');

     // 2. Table ActivationTokens
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ActivationTokens (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES Users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL
      )
    `);
    console.log('✅ Table ActivationTokens créée');
    // 4. Table Folders
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Folders (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id INT REFERENCES Users(id) ON DELETE CASCADE,
        is_shared BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Table Folders créée');

    // 5. Table Files
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Files (
        id SERIAL PRIMARY KEY,
        owner_id INT REFERENCES Users(id) ON DELETE CASCADE,
        folder_id INT REFERENCES Folders(id) ON DELETE SET NULL,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        size BIGINT NOT NULL,
        file_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Table Files créée');

    // 6. Table FileKeys
    await pool.query(`
      CREATE TABLE IF NOT EXISTS FileKeys (
        id SERIAL PRIMARY KEY,
        file_id INT REFERENCES Files(id) ON DELETE CASCADE,
        user_id INT REFERENCES Users(id) ON DELETE CASCADE,
        encrypted_key TEXT NOT NULL
      )
    `);
    console.log('✅ Table FileKeys créée');

    // 7. Table FolderUsers
    await pool.query(`
      CREATE TABLE IF NOT EXISTS FolderUsers (
        id SERIAL PRIMARY KEY,
        folder_id INT REFERENCES Folders(id) ON DELETE CASCADE,
        user_id INT REFERENCES Users(id) ON DELETE CASCADE,
        role VARCHAR(20) CHECK (role IN ('owner', 'editor', 'viewer'))
      )
    `);
    console.log('✅ Table FolderUsers créée');

    // 8. Table FolderKeys
    await pool.query(`
      CREATE TABLE IF NOT EXISTS FolderKeys (
        id SERIAL PRIMARY KEY,
        folder_id INT REFERENCES Folders(id) ON DELETE CASCADE,
        user_id INT REFERENCES Users(id) ON DELETE CASCADE,
        encrypted_folder_key TEXT NOT NULL
      )
    `);
    console.log('✅ Table FolderKeys créée');

    console.log('🎉 Toutes les tables sont prêtes !');
    process.exit(0);
  } catch (error) {
    console.error('Erreur:', error);
    process.exit(1);
  }
}

initDatabase();



// const pool = require('../config/db');

// async function initDatabase() {
//   try {
//     // 1️⃣ Table Users
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS Users (
//         id SERIAL PRIMARY KEY,
//         email VARCHAR(100) UNIQUE NOT NULL,
//         password_hash TEXT NOT NULL,
//         is_active BOOLEAN DEFAULT FALSE,
//         otp_secret TEXT,
//         seed_phrase TEXT, -- seed chiffrée pour ECC/RSA
//         quota BIGINT DEFAULT 1073741824, -- 1GB
//         used_space BIGINT DEFAULT 0,
//         created_at TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log('✅ Table Users créée');

//     // 2️⃣ Table Certificates
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS Certificates (
//         id SERIAL PRIMARY KEY,
//         user_id INT UNIQUE REFERENCES Users(id) ON DELETE CASCADE,
//         public_key TEXT NOT NULL,
//         signature TEXT NOT NULL,
//         algorithm VARCHAR(10) DEFAULT 'ECC', -- ECC ou RSA
//         version VARCHAR(10),
//         valid_until TIMESTAMP,
//         public_key_hash TEXT,
//         created_at TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log('✅ Table Certificates créée');

//     // 3️⃣ Table Folders
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS Folders (
//         id SERIAL PRIMARY KEY,
//         name TEXT NOT NULL,
//         owner_id INT REFERENCES Users(id) ON DELETE CASCADE,
//         is_shared BOOLEAN DEFAULT FALSE,
//         folder_key_version VARCHAR(10),
//         encryption_algorithm VARCHAR(20) DEFAULT 'AES-256-GCM',
//         created_at TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log('✅ Table Folders créée');

//     // 4️⃣ Table Files
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS Files (
//         id SERIAL PRIMARY KEY,
//         owner_id INT REFERENCES Users(id) ON DELETE CASCADE,
//         folder_id INT REFERENCES Folders(id) ON DELETE SET NULL,
//         filename TEXT NOT NULL,
//         path TEXT NOT NULL,
//         size BIGINT NOT NULL,
//         file_hash TEXT NOT NULL,
//         folder_key_id INT REFERENCES FolderKeys(id) ON DELETE SET NULL,
//         is_encrypted BOOLEAN DEFAULT TRUE,
//         created_at TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log('✅ Table Files créée');

//     // 5️⃣ Table FileKeys
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS FileKeys (
//         id SERIAL PRIMARY KEY,
//         file_id INT REFERENCES Files(id) ON DELETE CASCADE,
//         user_id INT REFERENCES Users(id) ON DELETE CASCADE,
//         encrypted_key TEXT NOT NULL,
//         algorithm VARCHAR(10) DEFAULT 'ECC',
//         created_at TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log('✅ Table FileKeys créée');

//     // 6️⃣ Table FolderUsers
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS FolderUsers (
//         id SERIAL PRIMARY KEY,
//         folder_id INT REFERENCES Folders(id) ON DELETE CASCADE,
//         user_id INT REFERENCES Users(id) ON DELETE CASCADE,
//         role VARCHAR(20) CHECK (role IN ('owner', 'editor', 'viewer')),
//         access_granted_at TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log('✅ Table FolderUsers créée');

//     // 7️⃣ Table FolderKeys
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS FolderKeys (
//         id SERIAL PRIMARY KEY,
//         folder_id INT REFERENCES Folders(id) ON DELETE CASCADE,
//         user_id INT REFERENCES Users(id) ON DELETE CASCADE,
//         encrypted_folder_key TEXT NOT NULL,
//         algorithm VARCHAR(10) DEFAULT 'AES-256-GCM',
//         version VARCHAR(10),
//         created_at TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log('✅ Table FolderKeys créée');

//     // 8️⃣ Table ActivationTokens
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS ActivationTokens (
//         id SERIAL PRIMARY KEY,
//         user_id INT REFERENCES Users(id) ON DELETE CASCADE,
//         token TEXT UNIQUE NOT NULL,
//         expires_at TIMESTAMP NOT NULL,
//         created_at TIMESTAMP DEFAULT NOW()
//       );
//     `);
//     console.log('✅ Table ActivationTokens créée');

//     console.log('🎉 Toutes les tables sont créées et prêtes pour le projet cloud sécurisé !');
//     process.exit(0);
//   } catch (error) {
//     console.error('Erreur:', error);
//     process.exit(1);
//   }
// }

// initDatabase();