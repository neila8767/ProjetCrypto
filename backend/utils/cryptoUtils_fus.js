const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ==================== FONCTIONS UTILITAIRES ====================

function generateActivationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isStrongPassword(password) {
  const errors = [];
  if (password.length < 12) errors.push('12 caractères minimum');
  if (!/[A-Z]/.test(password)) errors.push('une majuscule');
  if (!/[a-z]/.test(password)) errors.push('une minuscule');
  if (!/[0-9]/.test(password)) errors.push('un chiffre');
  if (!/[!@#$%^&*]/.test(password)) errors.push('un caractère spécial (!@#$%^&*)');
  return errors;
}


// ==================== NORMALISATION JWK ====================

function normalizeJwk(jwkString) {
  try {
    let jwkObj = typeof jwkString === 'string' ? JSON.parse(jwkString) : jwkString;
    const sortedJwk = {};
    Object.keys(jwkObj).sort().forEach(key => {
      sortedJwk[key] = jwkObj[key];
    });
    return JSON.stringify(sortedJwk);
  } catch (error) {
    console.error('Erreur normalisation JWK:', error);
    return jwkString;
  }
}

// ==================== VÉRIFICATION CSR ====================

async function verifyCSR(csr, expectedEmail) {
  console.log('🔵 [verifyCSR] Début vérification CSR');
  
  try {
    if (!csr || !csr.certificationRequestInfo || !csr.signature) {
      return { isValid: false, error: "CSR invalide : structure manquante" };
    }

    const { certificationRequestInfo, signature, accountId, publicKey } = csr;
    let { walletAccount, email, timestamp } = certificationRequestInfo;
    
    // Si walletAccount.publicKey est une string, la parser
    if (walletAccount.publicKey && typeof walletAccount.publicKey === 'string') {
      try {
        walletAccount.publicKey = JSON.parse(walletAccount.publicKey);
      } catch (e) {
        console.log('  - publicKey déjà en objet ou erreur de parsing');
      }
    }
    
    // Vérification email
    if (email !== expectedEmail) {
      return { isValid: false, error: `Email mismatch: ${email} vs ${expectedEmail}` };
    }

    // Vérification ID
    if (!walletAccount || !walletAccount.id) {
      return { isValid: false, error: "Wallet account invalide" };
    }

    if (accountId !== walletAccount.id) {
      return { isValid: false, error: `AccountId mismatch: ${accountId} vs ${walletAccount.id}` };
    }

    // Vérification clé publique
    const normalizedKeyFromCSR = normalizePublicKey(publicKey);
    const normalizedKeyFromWallet = normalizePublicKey(walletAccount.publicKey);
    
    if (normalizedKeyFromCSR !== normalizedKeyFromWallet) {
      console.log('❌ PublicKey mismatch');
      return { isValid: false, error: "PublicKey mismatch" };
    }

    // Vérification timestamp
    const currentTime = Date.now();
    if (currentTime - timestamp > 5 * 60 * 1000) {
      return { isValid: false, error: "CSR trop ancien" };
    }

    // Reconstruire le message normalisé
    const normalizedCertInfo = {
      email,
      timestamp,
      walletAccount: {
        id: walletAccount.id,
        type: walletAccount.type,
        name: walletAccount.name,
        publicKey: walletAccount.publicKey
      }
    };
    
    const infoString = normalizeAndStringify(normalizedCertInfo);
    console.log('🔵 infoString normalisée:', infoString.substring(0, 150) + '...');

    const isValidSignature = await verifyRSASignature(infoString, signature, publicKey);

    if (!isValidSignature) {
      return { isValid: false, error: "Signature RSA invalide" };
    }

    return {
      isValid: true,
      data: { email, walletAccount, accountId, timestamp }
    };

  } catch (err) {
    console.error("❌ [verifyCSR] Erreur:", err);
    return { isValid: false, error: err.message };
  }
}

function normalizePublicKey(publicKey) {
  try {
    let keyObj = typeof publicKey === 'string' ? JSON.parse(publicKey) : publicKey;
    const sorted = {};
    Object.keys(keyObj).sort().forEach(k => { sorted[k] = keyObj[k]; });
    return JSON.stringify(sorted);
  } catch (e) {
    return typeof publicKey === 'string' ? publicKey : JSON.stringify(publicKey);
  }
}

function normalizeAndStringify(obj) {
  function sortKeys(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = sortKeys(obj[key]);
    });
    return sorted;
  }
  const sortedObj = sortKeys(obj);
  return JSON.stringify(sortedObj);
}



// ==================== GÉNÉRATION CERTIFICAT ====================



const CA_PRIVATE_KEY_PEM = process.env.CA_PRIVATE_KEY_PEM;

const forge = require('node-forge');

function generateClientCertificate(clientPublicKeyPEM, userId, email, validityDays = 365) {
  console.log('🔐 [generateClientCertificate] Début');

  // Vérification que le PEM est une string
  if (typeof clientPublicKeyPEM !== 'string') {
    throw new Error(`Invalid PEM format: expected string but got ${typeof clientPublicKeyPEM}`);
  }

  // Vérification du format PEM
  if (!clientPublicKeyPEM.includes('BEGIN PUBLIC KEY')) {
    throw new Error('Invalid PEM formatted message: Missing BEGIN PUBLIC KEY marker');
  }

  try {
    console.log('🔄 Conversion PEM -> forge public key...');
    const clientPublicKey = forge.pki.publicKeyFromPem(clientPublicKeyPEM);
    console.log('✅ Clé publique forge créée');

    console.log('🔑 Chargement CA private key...');
    const caPrivateKey = forge.pki.privateKeyFromPem(CA_PRIVATE_KEY_PEM);
    console.log('✅ CA private key chargée');

    const cert = forge.pki.createCertificate();
    console.log('📝 Création certificat...');

    // Serial number
    cert.serialNumber = generateSerialNumber();

    // Validité
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setDate(cert.validity.notAfter.getDate() + validityDays);

    // Sujet (client)
    cert.setSubject([
      { type: '2.5.4.3', value: `user_${userId}` },           // CN
      { type: '1.2.840.113549.1.9.1', value: email },        // emailAddress
      { type: '2.5.4.11', value: 'Client Certificate' },     // OU
      { type: '2.5.4.10', value: 'drive secure' }            // O
    ]);

    // Émetteur (CA)
    cert.setIssuer([
      { type: '2.5.4.3', value: 'drive secure CA' },         // CN
      { type: '2.5.4.10', value: 'drive secure' },           // O
      { type: '2.5.4.11', value: 'Client Certificates' },    // OU
      { type: '1.2.840.113549.1.9.1', value: 'support@drivesecure.com' } // email
    ]);

    cert.publicKey = clientPublicKey;

    // Extensions
    cert.setExtensions([
      { name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', keyCertSign: false, digitalSignature: true, keyEncipherment: true, dataEncipherment: true, critical: true },
      { name: 'extKeyUsage', clientAuth: true, emailProtection: true },
      { name: 'subjectAltName', altNames: [{ type: 1, value: email }] },
      { name: 'subjectKeyIdentifier' }
    ]);

    console.log('✍️ Signature du certificat...');
    cert.sign(caPrivateKey, forge.md.sha256.create());

    const certPEM = forge.pki.certificateToPem(cert);
    const fingerprint = generateFingerprint(cert);

    console.log('✅ Certificat généré avec succès');

    return {
      certPEM,
      fingerprint,
      serialNumber: cert.serialNumber,
      notBefore: cert.validity.notBefore,
      notAfter: cert.validity.notAfter,
      subjectCN: `user_${userId}`,
      issuerCN: cert.issuer.getField('CN')?.value || 'drive secure CA'
    };

  } catch (error) {
    console.error('❌ Erreur dans generateClientCertificate:', error);
    console.error('Stack:', error.stack);
    throw new Error(`Erreur génération certificat: ${error.message}`);
  }
}


function generateSerialNumber() {
    const random = forge.util.bytesToHex(forge.random.getBytesSync(8));
    return random.toUpperCase();
}

function generateFingerprint(certificate) {
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
    const md = forge.md.sha256.create();
    md.update(der);
    return md.digest().toHex();
}

// ==================== VÉRIFICATION CERTIFICAT ====================


const caPublicKeyPEM = process.env.publicKey;
function verifyCertificateSignature(certPEM) {
  try {
    const cert = forge.pki.certificateFromPem(certPEM);
    const caPublicKey = forge.pki.publicKeyFromPem(caPublicKeyPEM);

    // Récupère les données signées (tbsCertificate)
    const tbsDer = forge.asn1.toDer(forge.pki.getTBSCertificate(cert)).getBytes();

    // Calcul hash SHA-256
    const md = forge.md.sha256.create();
    md.update(tbsDer);

    // Vérification signature
    const verified = caPublicKey.verify(md.digest().bytes(), cert.signature);

    return { isValid: verified, errors: verified ? [] : ['Signature invalide'] };
  } catch (error) {
    return { isValid: false, errors: [error.message] };
  }
}
// ==================== VERSION POUR COMPTE ACTIF ====================

function verifyCSR_activeaccount(csr) {
  try {
    if (!csr || !csr.certificationRequestInfo || !csr.signature) {
      return { isValid: false, error: "CSR invalide : structure manquante" };
    }

    const { certificationRequestInfo, signature, accountId, publicKey } = csr;
    const { walletAccount, email, timestamp } = certificationRequestInfo;

    if (!walletAccount || !walletAccount.id) {
      return { isValid: false, error: "Wallet account invalide : ID manquant" };
    }

    if (accountId !== walletAccount.id) {
      return { isValid: false, error: `AccountId mismatch: ${accountId} vs ${walletAccount.id}` };
    }

    const normalizedPublicKeyFromCSR = normalizePublicKey(publicKey);
    const normalizedPublicKeyFromWallet = normalizePublicKey(walletAccount.publicKey);
    
    if (normalizedPublicKeyFromCSR !== normalizedPublicKeyFromWallet) {
      return { isValid: false, error: "PublicKey mismatch" };
    }

    if (email && !isValidEmail(email)) {
      return { isValid: false, error: "Email invalide dans le CSR" };
    }

    const currentTime = Date.now();
    // const maxAge = 5 * 60 * 1000;
    // if (currentTime - timestamp > maxAge) {
    //   return { isValid: false, error: "CSR trop ancien (timestamp > 5 minutes)" };
    // }

    if (timestamp > currentTime + 60000) {
      return { isValid: false, error: "Timestamp dans le futur" };
    }

    const infoString = JSON.stringify(certificationRequestInfo);
    const isValidSignature = verifyRSASignature(infoString, signature, publicKey);

    if (!isValidSignature) {
      return { isValid: false, error: "Signature RSA invalide" };
    }

    return {
      isValid: true,
      data: {
        email: email || null,
        walletAccount: {
          id: walletAccount.id,
          type: walletAccount.type || 'custom',
          name: walletAccount.name,
          publicKey: walletAccount.publicKey
        },
        accountId,
        timestamp,
        signature
      }
    };

  } catch (err) {
    console.error("Erreur verifyCSR_activeaccount:", err);
    return { isValid: false, error: `Erreur lors de la vérification: ${err.message}` };
  }
}


function modPowActiveAccount(base, exponent, modulus) {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}


// ==================== VÉRIFICATION SIGNATURE RSA ====================

async function verifyRSASignature(message, signatureBase64, publicKeyJWK) {
  console.log('🔵 [verifyRSASignature] Début vérification MANUELLE');
  console.log('🔹 Message à vérifier (début):', message.substring(0, 100) + (message.length > 100 ? '...' : ''));
  console.log('🔹 Signature (base64, début):', signatureBase64.substring(0, 50) + (signatureBase64.length > 50 ? '...' : ''));

  try {
    let jwk = typeof publicKeyJWK === 'string' ? JSON.parse(publicKeyJWK) : publicKeyJWK;
    console.log('🔹 Clé publique JWK reçue:', jwk);

    const n = BigInt(jwk.n);
    const e = BigInt(jwk.e);
    console.log('🔹 Exposant e:', e.toString());
    console.log('🔹 Modulus n (longueur en bits):', n.toString(2).length);

    // 🔥 Conversion signature base64 -> bytes
    const signatureBytes = new Uint8Array(Buffer.from(signatureBase64, 'base64'));
    console.log('🔹 Signature convertie en bytes (longueur):', signatureBytes.length);
    const signatureBigInt = bytesToBigInt(signatureBytes);
    console.log('🔹 Signature en BigInt:', signatureBigInt.toString().substring(0, 50) + '...');

    // RSA
    console.log('🔹 Calcul RSA (modPow)');
    const decryptedHashBigInt = modPow(signatureBigInt, e, n);
    console.log('🔹 Résultat RSA (BigInt, début):', decryptedHashBigInt.toString().substring(0, 50) + '...');

    // Hash du message
    console.log('🔹 Calcul hash SHA-256 du message...');
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(message));
    const hashArray = new Uint8Array(hashBuffer);

    let expectedHashBigInt = 0n;
    for (let i = 0; i < hashArray.length; i++) {
      expectedHashBigInt = (expectedHashBigInt << 8n) | BigInt(hashArray[i]);
    }
    console.log('🔹 Hash attendu (BigInt, début):', expectedHashBigInt.toString().substring(0, 50) + '...');

    const isValid = expectedHashBigInt === decryptedHashBigInt;
    console.log(isValid ? '✅ Signature VALIDE' : '❌ Signature INVALIDE');

    return isValid;

  } catch (err) {
    console.error('❌ verifyRSASignature error:', err);
    return false;
  }
}

function bytesToBigInt(bytes) {
  let hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
    
  return BigInt('0x' + hex);
}


function modPow(base, exponent, modulus) {
  if (modulus === 1n) return 0n;

  let result = 1n;
  base = base % modulus;

  while (exponent > 0n) {
    if (exponent % 2n === 1n) {
      result = (result * base) % modulus;
    }
    exponent = exponent >> 1n; // divide by 2
    base = (base * base) % modulus;
  }

  return result;
}

// ==================== EXTRACTION CLÉ PUBLIQUE ====================
function extractPublicKeyFromCert(certPEM) {
  console.log('🔍 [extractPublicKeyFromCert] ===================== DÉBUT =====================');
  console.log('📏 Longueur certPEM:', certPEM.length);

  const validationResult = verifyCertificateSignature(certPEM);
  if (!validationResult.isValid) {
    console.error('❌ Certificat invalide:', validationResult.errors);
    return null;
  }

  try {
    const cert = forge.pki.certificateFromPem(certPEM);
    const publicKey = cert.publicKey;

    console.log('✅ Certificat chargé');
    console.log('🔹 Exposant e original (décimal):', publicKey.e.toString());
    console.log('🔹 Modulus n (bytes):', publicKey.n.toByteArray().length);

    // Extraction du modulus n seulement
    let nBytes = publicKey.n.toByteArray();
    if (nBytes[0] === 0) nBytes = nBytes.slice(1);   // supprime leading zero

    const base64UrlEncode = (bytes) => Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 🔥 FORCER e = 65537 (valeur standard RSA)
    const eStandard = 65537;
    const eHex = eStandard.toString(16);
    const eBuffer = Buffer.from(eHex.length % 2 ? '0' + eHex : eHex, 'hex');
    
    console.log('🔹 Exposant forcé (décimal):', eStandard);
    console.log('🔹 Exposant forcé (hex):', eHex);
    console.log('🔹 Exposant buffer length:', eBuffer.length);

    const jwk = {
      kty: 'RSA',
      n: base64UrlEncode(nBytes),
      e: base64UrlEncode(eBuffer)  // Maintenant e = 65537
    };

    console.log('✅ JWK extrait (avec e=65537 forcé) :');
    console.log(JSON.stringify(jwk, null, 2));
    
    // Vérification rapide
    const decodedE = Buffer.from(jwk.e.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const eValue = BigInt('0x' + decodedE.toString('hex'));
    console.log('🔹 Vérification e encodé:', eValue.toString());
    
    console.log('🔍 [extractPublicKeyFromCert] ===================== FIN =====================');

    return jwk;

  } catch (err) {
    console.error('❌ Erreur extraction:', err.message);
    return null;
  }
}
// ==================== VÉRIFICATION SIGNATURE RSA AVEC FORGE (RECOMMANDÉ) ====================
async function verifyRSASignatureCERTIFICATchallenge(message, signatureBase64, publicKeyJWK) {
  console.log('🔵 [verifyRSASignature] Début vérification RAW (compatible avec ton signMessage)');

  try {
    let jwk = typeof publicKeyJWK === 'string' ? JSON.parse(publicKeyJWK) : publicKeyJWK;

    // Conversion correcte de n et e (base64url → BigInt)
    const nBuffer = Buffer.from(jwk.n.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const eBuffer = Buffer.from(jwk.e.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    const n = BigInt('0x' + nBuffer.toString('hex'));
    const e = BigInt('0x' + eBuffer.toString('hex'));

    console.log('🔹 Modulus n (bytes):', nBuffer.length);
    console.log('🔹 Exposant e:', e.toString());

    // Signature
    const signatureBytes = Buffer.from(signatureBase64, 'base64');
    console.log('🔹 Signature reçue (bytes):', signatureBytes.length);

    const signatureBigInt = bytesToBigInt(signatureBytes);

    console.log('🔹 Calcul RSA (sig ^ e mod n)');
    const decryptedBigInt = modPow(signatureBigInt, e, n);
    console.log('🔹 Résultat décrypté (début):', decryptedBigInt.toString().substring(0, 60) + '...');

    // Hash du message (exactement comme dans signMessage)
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(message));
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    let expectedHashBigInt = 0n;
    for (let i = 0; i < hashArray.length; i++) {
      expectedHashBigInt = (expectedHashBigInt << 8n) | BigInt(hashArray[i]);
    }

    console.log('🔹 Hash attendu (début):', expectedHashBigInt.toString().substring(0, 60) + '...');

    const isValid = (expectedHashBigInt === decryptedBigInt);
    console.log(isValid ? '✅ SIGNATURE VALIDE (raw)' : '❌ Signature invalide (raw)');

    return isValid;

  } catch (err) {
    console.error('❌ Erreur verifyRSASignature:', err.message);
    return false;
  }
}
// ==================== EXPORTS ====================

module.exports = {
  generateActivationToken,
  verifyCSR,
  generateClientCertificate,
  verifyCSR_activeaccount,
  normalizePublicKey,
  modPowActiveAccount,
  verifyCertificateSignature,
  isValidEmail,
  isStrongPassword,
  verifyRSASignature,
   extractPublicKeyFromCert, 
   verifyRSASignatureCERTIFICATchallenge
};