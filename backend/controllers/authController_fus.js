const pool = require('../config/db');
const argon2 = require('argon2');
const forge = require('node-forge');
const crypto = require('crypto'); // Pour le fallback si besoin

const {
  generateActivationToken,
  generateClientCertificate,
  isValidEmail, 
  isStrongPassword, 
  verifyCSR, 
  verifyCSR_activeaccount
} = require('../utils/cryptoUtils_fus');

const { sendActivationEmail , sendResetPasswordEmail , sendConfirmationEmail} = require('../utils/emailUtils_fus');

class AuthFusController {
// POST /api/register-verifier - seulement création utilisateur + envoi email
static async registerVerifier(req, res) {
  console.log('🔵 [registerVerifier] Requête reçue');
  console.log('  - body:', JSON.stringify(req.body, null, 2).substring(0, 500));
  
  try {
    const { email, password, csrs } = req.body;

    console.log('  - email:', email);
    console.log('  - password présent:', !!password);
    console.log('  - csrs count:', csrs?.length);

    if (!email || !password || !Array.isArray(csrs) || csrs.length === 0) {
      console.log('❌ [registerVerifier] Champs manquants');
      return res.status(400).json({ 
        error: "Email, password et csrs sont requis" 
      });
    }

    if (!isValidEmail(email)) {
      console.log('❌ [registerVerifier] Email invalide');
      return res.status(400).json({ error: "Format email invalide" });
    }
    
    console.log('🔵 [registerVerifier] Vérification des CSR...');
    const verifiedWallets = [];
  
    for (let i = 0; i < csrs.length; i++) {
      const csr = csrs[i];
      console.log(`🔵 [registerVerifier] Vérification CSR ${i + 1}/${csrs.length}`);
      
      const verification =  await verifyCSR(csr, email);
      console.log(`  - verification.isValid: ${verification.isValid}`);
      if (!verification.isValid) {
        console.log(`❌ [registerVerifier] CSR invalide: ${verification.error}`);
        return res.status(400).json({ 
          error: `Signature invalide pour le compte ${csr.accountId || 'inconnu'}: ${verification.error}` 
        });
      }
      console.log(`✅ [registerVerifier] CSR ${i + 1} valide`);

      // On ne stocke que les infos nécessaires + le CSR complet
      verifiedWallets.push({
        walletAccountId: csr.certificationRequestInfo.walletAccount.id,
        name: csr.certificationRequestInfo.walletAccount.name,
        type: csr.certificationRequestInfo.walletAccount.type,
        csr: csr  // Stocker le CSR complet
      });
    }

    if (verifiedWallets.length === 0) {
      return res.status(400).json({ error: "Aucun wallet valide trouvé" });
    }

    const activationToken = generateActivationToken();
    const activationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const client = await pool.connect();

    // MODIFICATION: On hash le password reçu (pas passwordHash)
    const passwordHash = await argon2.hash(password);

    try {
      await client.query('BEGIN');

      // 1. Créer l'utilisateur (inactif)
      const userResult = await client.query(
        `INSERT INTO Users (email, password_hash, is_active, activation_token, activation_expires)
         VALUES ($1, $2, false, $3, $4) RETURNING id, email`,
        [email, passwordHash, activationToken, activationExpires]
      );

      const newUser = userResult.rows[0];

      // 2. Stocker les CSR en attente d'activation
      for (const wallet of verifiedWallets) {
        await client.query(
          `INSERT INTO pending_wallets (
            user_id, 
            wallet_account_id, 
            account_name, 
            account_type, 
            csr_json,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, DEFAULT)`,
          [
            newUser.id,
            wallet.walletAccountId,
            wallet.name,
            wallet.type,
            JSON.stringify(wallet.csr)  // Stocker le CSR complet en JSON
          ]
        );
      }

      await client.query('COMMIT');

      // Envoyer l'email d'activation
      const previewUrl = await sendActivationEmail(email, activationToken);

      res.status(201).json({
        userId: newUser.id,
        email: newUser.email,
        message: `Compte créé avec succès. Vérifiez vos emails pour activer votre compte et générer vos certificats.`,
        previewUrl,
        walletsCount: verifiedWallets.length
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error("Erreur register-verifier:", err);

    if (err.code === '23505') {
      if (err.constraint.includes('email')) {
        return res.status(409).json({ error: "Email déjà utilisé" });
      }
    }

    res.status(500).json({ error: "Erreur interne du serveur" });
  }
}

// GET /api/fus/activate - activation du compte + génération certificats
static async activateAccount(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Token d'activation requis" });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Vérifier le token
      const userResult = await client.query(
        `SELECT id, email FROM Users 
         WHERE activation_token = $1 
         AND is_active = false 
         AND activation_expires > NOW()`,
        [token]
      );

      if (userResult.rows.length === 0) {
        return res.status(400).json({ 
          error: "Token invalide, compte déjà activé ou expiré" 
        });
      }

      const user = userResult.rows[0];

      // 2. Récupérer les CSR en attente
      const pendingWallets = await client.query(
        `SELECT * FROM pending_wallets WHERE user_id = $1`,
        [user.id]
      );

      if (pendingWallets.rows.length === 0) {
        return res.status(400).json({ 
          error: "Aucun wallet trouvé pour cet utilisateur" 
        });
      }

      const certificates = [];

      // 3. Pour chaque wallet, re-vérifier le CSR et extraire la clé publique
      for (const pending of pendingWallets.rows) {
        const csr = pending.csr_json;
        
        // MODIFICATION: verifyCSR_activeaccount ne nécessite plus email/password externe
        // La fonction a été modifiée pour ne vérifier que la structure et la signature
        const verification = await verifyCSR_activeaccount(csr);
        
        if (!verification.isValid) {
          // Si un CSR est invalide, on annule toute l'activation
          throw new Error(`CSR invalide pour le compte ${pending.wallet_account_id}: ${verification.error}`);
        }

        // MODIFICATION: La clé publique est maintenant au format JWK (objet/string JSON)
        // On la récupère depuis walletAccount.publicKey (qui est une chaîne JSON)
        const publicKey = csr.certificationRequestInfo.walletAccount.publicKey;
        
        // MODIFICATION: Si la clé publique est une chaîne JSON, on peut la parser ou la garder telle quelle
        // La fonction generateClientCertificate a été adaptée pour accepter le format JWK
        const publicKeyPEM = await AuthFusController.jwkToPem(publicKey);
        const certificateData = generateClientCertificate(
        publicKeyPEM,
          user.id,
          user.email,
          365 // validité 1 an
        );

        // Stocker le certificat
      await client.query(
  `INSERT INTO client_certificates (
    user_id, 
    cert_pem, 
    fingerprint_sha256, 
    serial_number, 
    not_before,  
    not_after, 
    subject_cn, 
    issuer_cn
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
   ON CONFLICT (fingerprint_sha256)
DO NOTHING
  RETURNING id`,
  [
    user.id,
    certificateData.certPEM,
    certificateData.fingerprint,
    certificateData.serialNumber,
    certificateData.notBefore,
    certificateData.notAfter,
    certificateData.subjectCN,
    certificateData.issuerCN
  ]
);

        // Stocker le wallet avec son certificat (table définitive)
        await client.query(
          `INSERT INTO wallet_accounts (
            user_id, 
            wallet_account_id, 
            account_name, 
            account_type, 
            certificate_fingerprint,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, DEFAULT)
          ON CONFLICT (user_id, wallet_account_id) DO UPDATE SET
            account_name = EXCLUDED.account_name,
            account_type = EXCLUDED.account_type,
            certificate_fingerprint = EXCLUDED.certificate_fingerprint`,
          [
            user.id,
            pending.wallet_account_id,
            pending.account_name,
            pending.account_type,
            certificateData.fingerprint
          ]
        );

        certificates.push({
          accountId: pending.wallet_account_id,
          accountName: pending.account_name,
          accountType: pending.account_type,
          fingerprint: certificateData.fingerprint.substring(0, 16),
          serialNumber: certificateData.serialNumber,
          validUntil: certificateData.notAfter
        });
      }

      // 4. Supprimer les wallets en attente
      await client.query(`DELETE FROM pending_wallets WHERE user_id = $1`, [user.id]);

      // 5. Activer le compte
      await client.query(
        `UPDATE Users SET is_active = true, activation_token = NULL  
         WHERE id = $1`,
        [user.id]
      );

      await client.query('COMMIT');

      // Envoyer un email de confirmation
      await sendConfirmationEmail(user.email);

      // Rediriger vers le front-end avec succès
        const certificatesInfo = encodeURIComponent(JSON.stringify(certificates));
      res.redirect(`http://localhost:5173/ActivateSuccess?certificates=${certificates.length}&data=${certificatesInfo}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error("Erreur activation:", err);
    res.status(500).json({ error: "Erreur lors de l'activation" });
  }
}

static async jwkToPem(jwk) {
  console.log('\n🔑 [jwkToPem] ====== DEBUT CONVERSION ======');

  // =========================
  // 1. TYPE & PARSING
  // =========================
  console.log('📦 Type jwk reçu:', typeof jwk);

  if (typeof jwk === 'string') {
    console.log('📝 JWK est une string, parsing JSON...');
    try {
      jwk = JSON.parse(jwk);
      console.log('✅ Parsing réussi');
    } catch (err) {
      console.error('❌ Erreur parsing JSON:', err.message);
      throw new Error('Invalid JWK JSON');
    }
  }

  console.log('📦 Clés disponibles:', Object.keys(jwk));

  // =========================
  // 2. VALIDATION
  // =========================
  console.log('\n🔍 Vérification des champs...');
  console.log('   - n présent:', !!jwk.n);
  console.log('   - e présent:', !!jwk.e);

  if (!jwk.n || !jwk.e) {
    console.error('❌ JWK invalide:', jwk);
    throw new Error('JWK must contain n and e');
  }

  // =========================
  // 3. VALEURS BRUTES
  // =========================
  console.log('\n📊 [VALEURS JWK]');
  console.log('   🔢 n (début):', jwk.n.substring(0, 80) + '...');
  console.log('   🔢 n longueur:', jwk.n.length);
  console.log('   🔢 e:', jwk.e);
  console.log('   🔢 e longueur:', jwk.e.length);

  // =========================
  // 4. CONVERSION BigInteger
  // =========================
  console.log('\n🔄 [CONVERSION DECIMAL -> BigInteger]');
  
  let n, e;
  try {
    n = new forge.jsbn.BigInteger(jwk.n, 10);
    e = new forge.jsbn.BigInteger(jwk.e, 10);

    console.log('✅ Conversion BigInteger réussie');
    console.log('   - n bitLength:', n.bitLength());
    console.log('   - e (int):', e.toString());
  } catch (err) {
    console.error('❌ Erreur conversion BigInteger:', err.message);
    throw err;
  }

  // =========================
  // 5. CREATION CLE RSA
  // =========================
  console.log('\n🔄 [CREATION CLE RSA]');
  let key;
  try {
    key = forge.pki.setRsaPublicKey(n, e);
    console.log('✅ Clé RSA créée');
  } catch (err) {
    console.error('❌ Erreur création clé RSA:', err.message);
    throw err;
  }

  // =========================
  // 6. CONVERSION PEM
  // =========================
  console.log('\n🔄 [CONVERSION -> PEM]');
  let pem;
  try {
    pem = forge.pki.publicKeyToPem(key);

    console.log('✅ PEM généré');
    console.log('   - Type:', typeof pem);
    console.log('   - Longueur:', pem.length);

    const lines = pem.split('\n');
    console.log('   - Lignes:', lines.length);
    console.log('   - Header:', lines[0]);
    console.log('   - Footer:', lines[lines.length - 2]);

    console.log('   - Début PEM:', pem.substring(0, 80));
    console.log('   - Fin PEM:', pem.substring(pem.length - 50));
  } catch (err) {
    console.error('❌ Erreur conversion PEM:', err.message);
    throw err;
  }

  // =========================
  // 7. VALIDATION FINALE
  // =========================
  console.log('\n🔍 [VALIDATION PEM]');
  if (!pem.includes('BEGIN PUBLIC KEY')) {
    console.warn('⚠️ Header PEM manquant');
  }
  if (!pem.includes('END PUBLIC KEY')) {
    console.warn('⚠️ Footer PEM manquant');
  }


  
  console.log('\n📊 [RESUME]');
  console.log('   - n bits:', n.bitLength());
  console.log('   - e:', e.toString());
  console.log('   - PEM size:', pem.length);

  console.log('🔑 [jwkToPem] ====== FIN CONVERSION ======\n');

  return pem;
}


static async forgotPassword(req, res) {
  try {
    const { email } = req.body;
    
    // Vérifier si l'utilisateur existe
    const result = await pool.query('SELECT id FROM Users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email non trouvé" });
    }
    
    const resetToken = generateResetToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 heure
    
    await pool.query(
      'UPDATE Users SET reset_token = $1, reset_expires = $2 WHERE id = $3',
      [resetToken, resetExpires, result.rows[0].id]
    );
    
    await sendResetPasswordEmail(email, resetToken);
    
    res.json({ message: "Email de réinitialisation envoyé !" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}


}
module.exports = AuthFusController;