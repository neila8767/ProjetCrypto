// login.js - Version multi-wallet avec logs détaillés
const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendOTPEmail } = require('../utils/emailUtils_fus');
const { 
 verifyCertificateSignature,
  verifyRSASignature,
  extractPublicKeyFromCert, 
  verifyRSASignatureCERTIFICATchallenge
} = require('../utils/cryptoUtils_fus');

// Stockage temporaire des challenges
const challengeStore = new Map();
const otpStore = new Map();

console.log('🔧 [INIT] LoginController initialisé');
console.log('   - challengeStore taille:', challengeStore.size);
console.log('   - otpStore taille:', otpStore.size);

// Nettoyage toutes les 5 minutes
setInterval(() => {
  const now = Date.now();
  let challengeCleaned = 0;
  let otpCleaned = 0;
  
  for (const [key, value] of challengeStore.entries()) {
    if (value.expiresAt < now) {
      challengeStore.delete(key);
      challengeCleaned++;
    }
  }
  for (const [key, value] of otpStore.entries()) {
    if (value.expiresAt < now) {
      otpStore.delete(key);
      otpCleaned++;
    }
  }
  
  if (challengeCleaned > 0 || otpCleaned > 0) {
    console.log(`🧹 [CLEANUP] Nettoyage effectué: ${challengeCleaned} challenges, ${otpCleaned} OTPs`);
  }
}, 5 * 60 * 1000);

class LoginController {

  // ==================== ÉTAPE 1: INITIATE LOGIN ====================
  static async initiateLogin(req, res) {
    console.log('\n🚪 [LOGIN] ====== ÉTAPE 1: INITIATE LOGIN ======');
    console.log('📥 Requête reçue à:', new Date().toISOString());
    
    try {
      const { email, password } = req.body;
      console.log('📧 Email:', email);
      console.log('🔑 Password présent:', !!password);
      
      if (!email || !password) {
        console.log('❌ [LOGIN] Champs manquants');
        return res.status(400).json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });
      }
      
      // 1. Récupérer l'utilisateur
      console.log('🔍 [LOGIN] Recherche utilisateur dans base...');
      const userResult = await pool.query(
        `SELECT id, email, password_hash, is_active 
         FROM Users WHERE email = $1`,
        [email]
      );
      
      if (userResult.rows.length === 0) {
        console.log('❌ [LOGIN] Utilisateur non trouvé:', email);
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      }
      
      const user = userResult.rows[0];
      console.log('✅ [LOGIN] Utilisateur trouvé:', { id: user.id, email: user.email, is_active: user.is_active });
      
      // 2. Vérifier que le compte est activé
      if (!user.is_active) {
        console.log('❌ [LOGIN] Compte non activé pour:', email);
        return res.status(401).json({ error: 'ACCOUNT_NOT_ACTIVATED' });
      }
      
      // 3. Vérifier le mot de passe
      console.log('🔐 [LOGIN] Vérification mot de passe...');
      const isValidPassword = await argon2.verify(user.password_hash, password);
      if (!isValidPassword) {
        console.log('❌ [LOGIN] Mot de passe invalide pour:', email);
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      }
      console.log('✅ [LOGIN] Mot de passe valide');
      
      // 4. Récupérer TOUS les wallets avec leurs certificats
      console.log('🔍 [LOGIN] Recherche des wallets pour user_id:', user.id);
      const walletsResult = await pool.query(
        `SELECT 
          w.wallet_account_id,
          w.account_name,
          w.account_type,
          w.created_at as wallet_created_at,
          c.cert_pem,
          c.fingerprint_sha256,
          c.serial_number,
          c.not_before,
          c.not_after
         FROM wallet_accounts w
         JOIN client_certificates c ON c.fingerprint_sha256 = w.certificate_fingerprint
         WHERE w.user_id = $1
         ORDER BY w.account_type, w.account_name`,
        [user.id]
      );
      
      console.log(`📊 [LOGIN] ${walletsResult.rows.length} wallet(s) trouvé(s)`);
      if (walletsResult.rows.length === 0) {
        console.log('❌ [LOGIN] Aucun wallet trouvé');
        return res.status(401).json({ error: 'NO_WALLETS_FOUND' });
      }
      
      walletsResult.rows.forEach((w, idx) => {
        console.log(`   Wallet ${idx + 1}:`, {
          id: w.wallet_account_id,
          name: w.account_name,
          type: w.account_type,
          fingerprint: w.fingerprint_sha256?.substring(0, 16)
        });
      });
      
      // 5. Vérifier la validité de TOUS les certificats
    console.log('🔍 [LOGIN] Validation des certificats...');
for (const wallet of walletsResult.rows) {
  console.log(`   - Validation certificat pour wallet ${wallet.wallet_account_id}...`);
  const validationResult = verifyCertificateSignature(wallet.cert_pem);

  if (!validationResult.isValid) {
    console.error(`❌ [LOGIN] Certificat invalide pour wallet ${wallet.wallet_account_id}:`, validationResult.errors);
    return res.status(401).json({ 
      error: 'INVALID_CERTIFICATE',
      details: validationResult.errors 
    });
  }

  console.log(`✔️ Certificat valide pour wallet ${wallet.wallet_account_id}`);

        
         
        // Vérifier expiration
        if (validationResult.details && new Date(validationResult.details.notAfter) < new Date()) {
          console.error(`❌ [LOGIN] Certificat expiré pour ${wallet.wallet_account_id}, expiration:`, validationResult.details.notAfter);
          return res.status(401).json({ error: 'CERTIFICATE_EXPIRED' });
        }
        console.log(`   ✅ Certificat non expiré (expire le ${validationResult.details?.notAfter})`);
      }
      
      // 6. Générer UN challenge pour CHAQUE wallet
      const challengeId = crypto.randomBytes(32).toString('hex');
      console.log(`🔐 [LOGIN] Génération de challenges... challengeId: ${challengeId.substring(0, 16)}...`);
      
      const challenges = [];
      const storedWallets = [];
      
      for (let i = 0; i < walletsResult.rows.length; i++) {
        const wallet = walletsResult.rows[i];
        console.log(`   - Wallet ${i + 1}/${walletsResult.rows.length}: ${wallet.wallet_account_id}`);
        
        // Extraire la clé publique du certificat
        console.log(`      Extraction clé publique du certificat...`);
        const publicKeyJWK = await LoginController.extractPublicKeyFromCert(wallet.cert_pem);
        console.log(`      ✅ Clé publique extraite (n: ${publicKeyJWK.n?.substring(0, 20)}...)`);
        
        // Générer un challenge unique pour ce wallet
        const challenge = crypto.randomBytes(32).toString('base64');
        const nonce = crypto.randomBytes(16).toString('hex');
        const timestamp = Date.now();
        
        console.log(`      Challenge généré: ${challenge.substring(0, 20)}...`);
        console.log(`      Nonce: ${nonce.substring(0, 16)}...`);
        console.log(`      Timestamp: ${timestamp}`);
        
        challenges.push({
          walletAccountId: wallet.wallet_account_id,
          accountName: wallet.account_name,
          accountType: wallet.account_type,
          challenge: challenge,
          nonce: nonce,
          timestamp: timestamp
        });
        
        storedWallets.push({
          wallet_account_id: wallet.wallet_account_id,
          account_name: wallet.account_name,
          account_type: wallet.account_type,
          challenge: challenge,
          nonce: nonce,
          timestamp: timestamp,
          publicKeyJWK: publicKeyJWK,
          cert_pem: wallet.cert_pem,
          fingerprint: wallet.fingerprint_sha256
        });
      }
      
      // Stocker les challenges
      challengeStore.set(challengeId, {
        userId: user.id,
        email: user.email,
        wallets: storedWallets,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        used: false,
        signaturesReceived: []
      });

      console.log(`✅ [LOGIN] ${storedWallets.length} challenges stockés pour user ${user.id}`);
      console.log(`   - Expiration: ${new Date(Date.now() + 5 * 60 * 1000).toISOString()}`);
      console.log(`   - challengeStore taille: ${challengeStore.size}`);
      
      // 7. Envoyer TOUS les challenges au client
      console.log('📤 [LOGIN] Envoi des challenges au client');
      res.json({
        challengeId: challengeId,
        challenges: challenges,
        threshold: storedWallets.length,
        message: `Please sign ${storedWallets.length} challenge(s) with your wallets`,
        expiresIn: 300
      });
      
      console.log('✅ [LOGIN] ÉTAPE 1 terminée avec succès\n');
      
    } catch (error) {
      console.error('❌ [LOGIN] Initiate login error:', error);
      console.error('   Stack:', error.stack);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }

  // ==================== ÉTAPE 2: VERIFY SIGNATURES ====================
  
  static async verifySignatures(req, res) {
    console.log('\n🔏 [VERIFY] ====== ÉTAPE 2: VERIFY SIGNATURES ======');
    console.log('📥 Requête reçue à:', new Date().toISOString());
    
    try {
        const { challengeId, signatures } = req.body;
        console.log('🔑 challengeId:', challengeId?.substring(0, 16) + '...');
        console.log('📝 signatures reçues:', signatures?.length || 0);
        
        if (!challengeId || !signatures || !Array.isArray(signatures)) {
            console.log('❌ [VERIFY] Requête invalide');
            return res.status(400).json({ error: 'INVALID_REQUEST' });
        }
        
        console.log('🔍 [VERIFY] Recherche du challenge dans store...');
        const challengeData = challengeStore.get(challengeId);
        if (!challengeData) {
            console.log('❌ [VERIFY] Challenge non trouvé ou expiré');
            return res.status(401).json({ error: 'CHALLENGE_EXPIRED_OR_INVALID' });
        }
        
        console.log('✅ [VERIFY] Challenge trouvé pour user:', challengeData.userId);
        
        if (challengeData.used) {
            console.log('❌ [VERIFY] Challenge déjà utilisé');
            return res.status(401).json({ error: 'CHALLENGE_ALREADY_USED' });
        }
        
        // Vérifier le nombre de signatures
        if (signatures.length !== challengeData.wallets.length) {
            console.log(`❌ [VERIFY] Nombre incorrect: attendu ${challengeData.wallets.length}, reçu ${signatures.length}`);
            return res.status(401).json({ 
                error: 'INVALID_SIGNATURE_COUNT', 
                expected: challengeData.wallets.length, 
                received: signatures.length 
            });
        }
        
        // Vérifier CHAQUE signature
        const verifiedSignatures = [];
        
        for (let i = 0; i < signatures.length; i++) {
            const sig = signatures[i];
            console.log(`\n   Signature ${i + 1}/${signatures.length}:`);
            console.log(`      walletAccountId: ${sig.walletAccountId}`);
            
            // Trouver le wallet correspondant
            const wallet = challengeData.wallets.find(w => w.wallet_account_id === sig.walletAccountId);
            
            if (!wallet) {
                console.log(`❌ Wallet non trouvé: ${sig.walletAccountId}`);
                return res.status(401).json({ 
                    error: 'UNKNOWN_WALLET_ACCOUNT', 
                    accountId: sig.walletAccountId 
                });
            }
            
            console.log(`      Wallet: ${wallet.account_name}`);
            
            // 🔥 VÉRIFICATION 1: Comparer la clé publique reçue avec celle du CERTIFICAT
            console.log(`      Vérification clé publique avec le certificat...`);
            
            // Extraire la clé publique du certificat (PEM -> JWK)
           const publicKeyFromCert = await extractPublicKeyFromCert(wallet.cert_pem);
             
            // Normaliser les deux clés pour comparaison
            // const normalizedCert = normalizePublicKey(publicKeyFromCert);
            // const normalizedReceived = normalizePublicKey(sig.publicKey);
            
            // console.log(`      Clé du certificat (e): ${publicKeyFromCert.e}`);
            // console.log(`      Clé reçue (e): ${sig.publicKey?.e}`);
            
            // if (normalizedCert !== normalizedReceived) {
            //     console.error(`❌ Clé publique ne correspond pas au certificat`);
            //     return res.status(401).json({ 
            //         error: 'PUBLIC_KEY_MISMATCH',
            //         walletAccountId: wallet.wallet_account_id
            //     });
            // }
            // console.log(`      ✅ Clé publique correspond au certificat`);
            
            // 🔥 VÉRIFICATION 2: Vérifier la signature du challenge
            const originalMessage = `${wallet.challenge}:${wallet.nonce}:${wallet.timestamp}`;
            console.log(`      Message signé: ${originalMessage.substring(0, 50)}...`);
            
            // Utiliser la clé publique du certificat pour vérifier
            const isValid = await verifyRSASignatureCERTIFICATchallenge(
                originalMessage,
                sig.signature,
                publicKeyFromCert 
            );
            
            if (!isValid) {
                console.error(`❌ Signature invalide pour wallet ${wallet.wallet_account_id}`);
                return res.status(401).json({ 
                    error: 'INVALID_SIGNATURE',
                    walletAccountId: wallet.wallet_account_id
                });
            }
            
            console.log(`      ✅ Signature valide`);
            
            verifiedSignatures.push({
                walletAccountId: wallet.wallet_account_id,
                accountName: wallet.account_name,
                verified: true
            });
        }
        
        // Toutes les signatures sont valides
        console.log(`\n✅ Toutes les ${verifiedSignatures.length} signatures sont valides !`);
        challengeData.used = true;
        
        // Générer un token temporaire
        const tempToken = jwt.sign(
            { 
                userId: challengeData.userId, 
                email: challengeData.email,
                wallets: challengeData.wallets.map(w => ({
                    accountId: w.wallet_account_id,
                    accountName: w.account_name,
                    accountType: w.account_type
                })),
                type: 'temp',
                authenticatedAt: Date.now()
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            tempToken: tempToken,
            requires2FA: true,
            message: `All ${verifiedSignatures.length} signatures verified, OTP required`
        });
        
    } catch (error) {
        console.error('❌ [VERIFY] Erreur:', error);
        res.status(500).json({ error: 'SERVER_ERROR' });
    }
}

  
  // ==================== ÉTAPE 3: SEND OTP ====================
  static async sendOTP(req, res) {
    console.log('\n📧 [OTP_SEND] ====== ÉTAPE 3: SEND OTP ======');
    console.log('📥 Requête reçue à:', new Date().toISOString());
    
    try {
      const { tempToken } = req.body;
      console.log('🔑 tempToken présent:', !!tempToken);
      if (tempToken) console.log(`   tempToken (début): ${tempToken.substring(0, 30)}...`);
      
      if (!tempToken) {
        console.log('❌ [OTP_SEND] TEMP_TOKEN_REQUIRED');
        return res.status(400).json({ error: 'TEMP_TOKEN_REQUIRED' });
      }
      
      console.log('🔍 [OTP_SEND] Vérification du token temporaire...');
      let decoded;
      try {
        decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        console.log('✅ [OTP_SEND] Token valide');
        console.log(`   - userId: ${decoded.userId}`);
        console.log(`   - email: ${decoded.email}`);
        console.log(`   - type: ${decoded.type}`);
        console.log(`   - wallets: ${decoded.wallets?.length || 0}`);
      } catch (err) {
        console.error('❌ [OTP_SEND] Token invalide:', err.message);
        return res.status(401).json({ error: 'INVALID_TEMP_TOKEN' });
      }
      
      if (decoded.type !== 'temp') {
        console.error(`❌ [OTP_SEND] Mauvais type de token: ${decoded.type} (attendu: temp)`);
        return res.status(401).json({ error: 'INVALID_TOKEN_TYPE' });
      }
      
      // Générer l'OTP
      const otpCode = crypto.randomInt(100000, 999999).toString();
      const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');
      
      console.log(`🔢 [OTP_SEND] OTP généré: ${otpCode}`);
      console.log(`   - hash: ${otpHash.substring(0, 16)}...`);
      
      otpStore.set(decoded.userId, {
        codeHash: otpHash,
        tempToken: tempToken,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0
      });
      
      console.log(`💾 [OTP_SEND] OTP stocké pour userId: ${decoded.userId}`);
      console.log(`   - Expiration: ${new Date(Date.now() + 10 * 60 * 1000).toISOString()}`);
      console.log(`   - otpStore taille: ${otpStore.size}`);
      
      // Envoyer l'email
      console.log(`📧 [OTP_SEND] Envoi de l'email OTP à ${decoded.email}...`);
      try {
        await sendOTPEmail(decoded.email, otpCode);
        console.log('✅ [OTP_SEND] Email OTP envoyé avec succès');
      } catch (emailError) {
        console.error('❌ [OTP_SEND] Erreur envoi email:', emailError);
        // On continue quand même
      }
      
      console.log('📤 [OTP_SEND] Envoi de la réponse au client');
      res.json({
        success: true,
        message: 'OTP sent to your email',
        expiresIn: 600
      });
      
      console.log('✅ [OTP_SEND] ÉTAPE 3 terminée avec succès\n');
      
    } catch (error) {
      console.error('❌ [OTP_SEND] Send OTP error:', error);
      console.error('   Stack:', error.stack);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }

  // ==================== ÉTAPE 4: VERIFY OTP ====================
  static async verifyOTP(req, res) {
    console.log('\n🔐 [OTP_VERIFY] ====== ÉTAPE 4: VERIFY OTP ======');
    console.log('📥 Requête reçue à:', new Date().toISOString());
    
    try {
      const { tempToken, otp } = req.body;
      console.log('🔑 tempToken présent:', !!tempToken);
      console.log('🔢 OTP présent:', !!otp);
      if (otp) console.log(`   OTP: ${otp}`);
      
      if (!tempToken || !otp) {
        console.log('❌ [OTP_VERIFY] TOKEN_AND_OTP_REQUIRED');
        return res.status(400).json({ error: 'TOKEN_AND_OTP_REQUIRED' });
      }
      
      console.log('🔍 [OTP_VERIFY] Vérification du token temporaire...');
      let decoded;
      try {
        decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        console.log('✅ [OTP_VERIFY] Token valide');
        console.log(`   - userId: ${decoded.userId}`);
        console.log(`   - email: ${decoded.email}`);
        console.log(`   - type: ${decoded.type}`);
      } catch (err) {
        console.error('❌ [OTP_VERIFY] Token invalide:', err.message);
        return res.status(401).json({ error: 'INVALID_TEMP_TOKEN' });
      }
      
      if (decoded.type !== 'temp') {
        console.error(`❌ [OTP_VERIFY] Mauvais type de token: ${decoded.type} (attendu: temp)`);
        return res.status(401).json({ error: 'INVALID_TOKEN_TYPE' });
      }
      
      console.log(`🔍 [OTP_VERIFY] Recherche de l'OTP pour userId: ${decoded.userId}`);
      const storedOTP = otpStore.get(decoded.userId);
      
      if (!storedOTP) {
        console.log(`❌ [OTP_VERIFY] OTP non trouvé pour userId: ${decoded.userId}`);
        console.log(`   - otpStore contient ${otpStore.size} entrées`);
        console.log(`   - clés présentes: ${Array.from(otpStore.keys()).join(', ')}`);
        return res.status(401).json({ error: 'OTP_NOT_FOUND_OR_EXPIRED' });
      }
      
      console.log('✅ [OTP_VERIFY] OTP trouvé');
      console.log(`   - Expiration: ${new Date(storedOTP.expiresAt).toISOString()}`);
      console.log(`   - Temps restant: ${Math.max(0, Math.floor((storedOTP.expiresAt - Date.now()) / 1000))} secondes`);
      console.log(`   - Tentatives actuelles: ${storedOTP.attempts}`);
      
      if (storedOTP.expiresAt < Date.now()) {
        console.log('❌ [OTP_VERIFY] OTP expiré');
        otpStore.delete(decoded.userId);
        return res.status(401).json({ error: 'OTP_EXPIRED' });
      }
      
      if (storedOTP.attempts >= 3) {
        console.log('❌ [OTP_VERIFY] Trop de tentatives (max 3)');
        otpStore.delete(decoded.userId);
        return res.status(401).json({ error: 'TOO_MANY_ATTEMPTS' });
      }
      
      if (storedOTP.tempToken !== tempToken) {
        console.log('❌ [OTP_VERIFY] Token ne correspond pas');
        storedOTP.attempts++;
        otpStore.set(decoded.userId, storedOTP);
        console.log(`   - Nouvelles tentatives: ${storedOTP.attempts}`);
        return res.status(401).json({ error: 'INVALID_OTP_SESSION' });
      }
      
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      console.log(`🔢 [OTP_VERIFY] Vérification OTP...`);
      console.log(`   - Hash reçu: ${otpHash.substring(0, 16)}...`);
      console.log(`   - Hash stocké: ${storedOTP.codeHash.substring(0, 16)}...`);
      
      if (storedOTP.codeHash !== otpHash) {
        console.log('❌ [OTP_VERIFY] Code OTP invalide');
        storedOTP.attempts++;
        otpStore.set(decoded.userId, storedOTP);
        console.log(`   - Nouvelles tentatives: ${storedOTP.attempts}`);
        return res.status(401).json({ error: 'INVALID_OTP' });
      }
      
      console.log('✅ [OTP_VERIFY] Code OTP valide !');
      
      // Récupérer l'utilisateur
      console.log('🔍 [OTP_VERIFY] Récupération de l\'utilisateur...');
      const userResult = await pool.query(
        `SELECT id, email FROM Users WHERE id = $1`,
        [decoded.userId]
      );
      
      if (userResult.rows.length === 0) {
        console.error('❌ [OTP_VERIFY] Utilisateur non trouvé:', decoded.userId);
        return res.status(401).json({ error: 'USER_NOT_FOUND' });
      }
      
      const user = userResult.rows[0];
      console.log('✅ [OTP_VERIFY] Utilisateur trouvé:', { id: user.id, email: user.email });
      
      // Générer les tokens finaux
      console.log('🔑 [OTP_VERIFY] Génération des tokens finaux...');
      const accessToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          wallets: decoded.wallets,
          type: 'access',
          authenticatedAt: Date.now()
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      const refreshToken = jwt.sign(
        {
          userId: user.id,
          type: 'refresh',
          version: Date.now()
        },
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      console.log(`✅ [OTP_VERIFY] Tokens générés`);
      console.log(`   - accessToken (début): ${accessToken.substring(0, 30)}...`);
      console.log(`   - refreshToken (début): ${refreshToken.substring(0, 30)}...`);
      
      // Nettoyer les stores
      console.log('🧹 [OTP_VERIFY] Nettoyage des stores...');
      let challengesCleaned = 0;
      challengeStore.forEach((value, key) => {
        if (value.userId === user.id) {
          challengeStore.delete(key);
          challengesCleaned++;
        }
      });
      otpStore.delete(decoded.userId);
      console.log(`   - ${challengesCleaned} challenges supprimés`);
      console.log(`   - OTP supprimé`);
      
      console.log('📤 [OTP_VERIFY] Envoi de la réponse au client');
      res.json({
        success: true,
        accessToken: accessToken,
        refreshToken: refreshToken,
        user: {
          id: user.id,
          email: user.email,
          wallets: decoded.wallets
        },
        expiresIn: 900,
        message: 'Login successful'
      });
      
      console.log('✅ [OTP_VERIFY] ÉTAPE 4 terminée avec succès - LOGIN COMPLET ! 🎉\n');
      
    } catch (error) {
      console.error('❌ [OTP_VERIFY] Verify OTP error:', error);
      console.error('   Stack:', error.stack);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
  
  // ==================== REFRESH TOKEN ====================
  static async refreshToken(req, res) {
    console.log('\n🔄 [REFRESH] ====== REFRESH TOKEN ======');
    console.log('📥 Requête reçue à:', new Date().toISOString());
    
    try {
      const { refreshToken } = req.body;
      console.log('🔑 refreshToken présent:', !!refreshToken);
      
      if (!refreshToken) {
        console.log('❌ [REFRESH] REFRESH_TOKEN_REQUIRED');
        return res.status(400).json({ error: 'REFRESH_TOKEN_REQUIRED' });
      }
      
      console.log('🔍 [REFRESH] Vérification du refresh token...');
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
        console.log('✅ [REFRESH] Token valide');
        console.log(`   - userId: ${decoded.userId}`);
        console.log(`   - type: ${decoded.type}`);
        console.log(`   - version: ${decoded.version}`);
        
        if (decoded.type !== 'refresh') {
          console.error(`❌ [REFRESH] Mauvais type de token: ${decoded.type} (attendu: refresh)`);
          return res.status(401).json({ error: 'INVALID_TOKEN_TYPE' });
        }
      } catch (err) {
        console.error('❌ [REFRESH] Token invalide:', err.message);
        return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
      }
      
      console.log('🔍 [REFRESH] Récupération de l\'utilisateur...');
      const userResult = await pool.query(
        `SELECT id, email FROM Users WHERE id = $1`,
        [decoded.userId]
      );
      
      if (userResult.rows.length === 0) {
        console.error('❌ [REFRESH] Utilisateur non trouvé:', decoded.userId);
        return res.status(401).json({ error: 'USER_NOT_FOUND' });
      }
      
      const user = userResult.rows[0];
      console.log('✅ [REFRESH] Utilisateur trouvé:', { id: user.id, email: user.email });
      
      console.log('🔑 [REFRESH] Génération du nouveau access token...');
      const accessToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          type: 'access'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      console.log(`✅ [REFRESH] Nouveau access token généré: ${accessToken.substring(0, 30)}...`);
      
      console.log('📤 [REFRESH] Envoi de la réponse au client');
      res.json({
        success: true,
        accessToken: accessToken,
        expiresIn: 900
      });
      
      console.log('✅ [REFRESH] Token rafraîchi avec succès\n');
      
    } catch (error) {
      console.error('❌ [REFRESH] Refresh token error:', error);
      console.error('   Stack:', error.stack);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
  
  // ==================== UTILITAIRES ====================
  
  static async extractPublicKeyFromCert(certPem) {
    console.log('🔧 [EXTRACT] Extraction clé publique du certificat...');
    try {
      const forge = require('node-forge');
      console.log('   - Conversion certificat PEM -> forge...');
      const cert = forge.pki.certificateFromPem(certPem);
      const publicKey = cert.publicKey;
      
      console.log('   - Conversion clé forge -> hex...');
      const n = publicKey.n.toString(16);
      const e = publicKey.e.toString(16);
      
      console.log(`   - n (modulus) longueur: ${n.length} caractères hex`);
      console.log(`   - e (exponent): ${e}`);
      
      console.log('   - Conversion hex -> base64url...');
      const nBase64 = Buffer.from(n, 'hex').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const eBase64 = Buffer.from(e, 'hex').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      const jwk = {
        kty: 'RSA',
        n: nBase64,
        e: eBase64,
        alg: 'RS256',
        use: 'sig'
      };
      
      console.log('✅ [EXTRACT] JWK extrait avec succès');
      console.log(`   - kty: ${jwk.kty}`);
      console.log(`   - n (début): ${jwk.n.substring(0, 30)}...`);
      console.log(`   - e: ${jwk.e}`);
      
      return jwk;
    } catch (error) {
      console.error('❌ [EXTRACT] Erreur extraction clé publique:', error);
      throw error;
    }
  }
}

module.exports = LoginController;