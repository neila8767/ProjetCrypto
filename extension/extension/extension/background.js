


// ============================================================================
// BACKGROUND.JS - IMPLÉMENTATION MANUELLE DE RSA (sans WebCrypto)
// Avec gestion complète des comptes : création, ajout, détails, signature
// ============================================================================

// ========================= 1. FONCTIONS ARITHMÉTIQUES =========================
function modPow(base, exponent, modulus) {
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

function egcd(a, b) {
    if (b === 0n) return { gcd: a, x: 1n, y: 0n };
    const { gcd, x, y } = egcd(b, a % b);
    return { gcd, x: y, y: x - (a / b) * y };
}

function modInverse(a, m) {
    const { gcd, x } = egcd(a, m);
    if (gcd !== 1n) throw new Error("Inverse n'existe pas");
    return (x % m + m) % m;
}

// ========================= 2. GÉNÉRATION DE NOMBRES PREMIERS =========================
function randomBigInt(bits) {
    const bytes = Math.ceil(bits / 8);
    const randomBytes = crypto.getRandomValues(new Uint8Array(bytes));
    let result = 0n;
    for (let i = 0; i < bytes; i++) result = (result << 8n) | BigInt(randomBytes[i]);
    const mask = 1n << BigInt(bits - 1);
    result = result | mask;
    result = result | 1n;
    const fullMask = (1n << BigInt(bits)) - 1n;
    result = result & fullMask;
    return result;
}

function isPrimeMillerRabin(n, t = 40) {
    if (n === 2n || n === 3n) return true;
    if (n < 2n || n % 2n === 0n) return false;
    let d = n - 1n;
    let s = 0n;
    while (d % 2n === 0n) { d /= 2n; s++; }
    function witness(a) {
        let x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) return false;
        for (let i = 1n; i < s; i++) {
            x = (x * x) % n;
            if (x === n - 1n) return false;
            if (x === 1n) return true;
        }
        return true;
    }
    for (let i = 0; i < t; i++) {
        let a = 2n + BigInt(Math.floor(Math.random() * Number(n - 4n)));
        if (witness(a)) return false;
    }
    return true;
}

function generatePrime(bits) {
    while (true) {
        let candidate = randomBigInt(bits);
        if (isPrimeMillerRabin(candidate)) return candidate;
        candidate += 2n;
        const maxVal = (1n << BigInt(bits)) - 1n;
        while (candidate <= maxVal) {
            if (isPrimeMillerRabin(candidate)) return candidate;
            candidate += 2n;
        }
    }
}

// ========================= 3. GÉNÉRATION D'UNE PAIRE DE CLÉS RSA =========================
// async function generateRSAKeyPair(bits = 2048) {
//     const halfBits = bits / 2;
//     let p, q;
//     do { p = generatePrime(halfBits); q = generatePrime(halfBits); } while (p === q);
//     const n = p * q;
//     const phi = (p - 1n) * (q - 1n);
//     let e = 65537n;
//     while (e >= phi || modInverse(e, phi) === undefined) e += 2n;
//     const d = modInverse(e, phi);
//     return { publicKey: { n, e }, privateKey: { d, p, q, n } };
// }


// ========================= 3. GÉNÉRATION D'UNE PAIRE DE CLÉS RSA (CORRIGÉE) =========================
async function generateRSAKeyPair(bits = 2048) {
    console.log(`🔑 Génération paire RSA ${bits} bits...`);

    const halfBits = Math.floor(bits / 2);
    let p, q, n;

    // Génération de p et q
    do {
        p = generatePrime(halfBits);
        q = generatePrime(halfBits);
    } while (p === q || p * q < (1n << BigInt(bits - 1))); // s'assurer que n fait bien ~bits bits

    n = p * q;
    const phi = (p - 1n) * (q - 1n);

    // Exposant fixe classique (très important !)
    const e = 65537n;

    // Calcul de l'inverse (d)
    let d;
    try {
        d = modInverse(e, phi); 
        
    } catch (err) {
        throw new Error("Impossible de calculer l'inverse modulaire (e et phi non coprimes)");
    }

    console.log(`✅ Clé générée avec succès`);
    console.log(`   - Taille n (bits) : ${n.toString(2).length}`);
    console.log(`   - Exposant e      : ${e.toString()} (0x${e.toString(16)})`);

    return {
        publicKey: { n, e },
        privateKey: { n, e, d, p, q }   // on garde tout pour la signature
    };
}

// ========================= 4. CHIFFREMENT / DÉCHIFFREMENT RSA =========================
function rsaEncrypt(m, publicKey) {
    if (m >= publicKey.n) throw new Error("Message trop grand");
    return modPow(m, publicKey.e, publicKey.n);
}

function rsaDecrypt(c, privateKey) {
    const { d, p, q, n } = privateKey;
    const dp = d % (p - 1n);
    const dq = d % (q - 1n);
    const m_p = modPow(c, dp, p);
    const m_q = modPow(c, dq, q);
    const q_inv = modInverse(q, p);
    const m = (m_p + (q_inv * (m_q - m_p) % p) * q) % n;
    return (m + n) % n;
}

// ========================= 5. SIGNATURE RSA =========================
async function signMessage(message, privateKey) {
    console.log('🔵 [BACKGROUND] signMessage - Début');
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(message));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    let hashBigInt = 0n;
    for (let i = 0; i < hashArray.length; i++) hashBigInt = (hashBigInt << 8n) | BigInt(hashArray[i]);
    if (hashBigInt >= privateKey.n) throw new Error("Hash trop grand");
    const signatureBigInt = modPow(hashBigInt, privateKey.d, privateKey.n);
    const signatureBytes = bigIntToBytes(signatureBigInt, (privateKey.n.toString(16).length + 1) / 2);
    const signatureBase64 = btoa(String.fromCharCode(...signatureBytes));
    console.log('✅ [BACKGROUND] signMessage - Signature générée');
    return signatureBase64;
}

// ========================= 6. CONVERSIONS =========================
function bigIntToBytes(bigInt, length) {
    let hex = bigInt.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    const bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    if (length && bytes.length < length) {
        const padded = new Uint8Array(length);
        padded.set(bytes, length - bytes.length);
        return padded;
    }
    return bytes;
}

function bytesToBigInt(bytes) {
    let hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return BigInt('0x' + hex);
}

// ========================= 7. FONCTIONS HYBRIDES (AES-GCM + RSA) =========================
async function encryptFile(fileBuffer, publicKeyJwk) {
    const pub = JSON.parse(publicKeyJwk);
    const publicKey = { n: BigInt(pub.n), e: BigInt(pub.e) };
    const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedFile = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, fileBuffer);
    const aesKeyJwk = await crypto.subtle.exportKey('jwk', aesKey);
    const aesKeyData = new TextEncoder().encode(JSON.stringify(aesKeyJwk));
    let m = bytesToBigInt(aesKeyData);
    if (m >= publicKey.n) throw new Error("Clé AES trop grande");
    const encryptedAesKey = rsaEncrypt(m, publicKey);
    const encryptedAesKeyBytes = bigIntToBytes(encryptedAesKey, (publicKey.n.toString(16).length + 1) / 2);
    return {
        encryptedFile: Array.from(new Uint8Array(encryptedFile)),
        encryptedAesKey: Array.from(encryptedAesKeyBytes),
        iv: Array.from(iv),
        accountId: walletState.activeAccount?.id || 'personal'
    };
}

async function decryptFile(encryptedData) {
    if (!walletState.isUnlocked) throw new Error('Wallet not unlocked');
    const { encryptedFile, encryptedAesKey, iv, accountId } = encryptedData;
    let privateKeyObj;
    if (accountId === walletState.activeAccount?.id) privateKeyObj = walletState.activeAccount.keyPair.privateKey;
    else {
        const account = walletState.accounts.find(a => a.id === accountId);
        if (!account) throw new Error('Account not found');
        privateKeyObj = account.keyPair.privateKey;
    }
    const c = bytesToBigInt(new Uint8Array(encryptedAesKey));
    const m = rsaDecrypt(c, privateKeyObj);
    const aesKeyBytes = bigIntToBytes(m);
    const aesKeyJwk = JSON.parse(new TextDecoder().decode(aesKeyBytes));
    const aesKey = await crypto.subtle.importKey('jwk', aesKeyJwk, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const decryptedFile = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, aesKey, new Uint8Array(encryptedFile));
    return Array.from(new Uint8Array(decryptedFile));
}

// ========================= 8. FONCTIONS DE NORMALISATION =========================
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

// ========================= 9. GESTION DU WALLET =========================
let walletState = { isUnlocked: false, accounts: [], activeAccount: null };
const pendingSignRequests = new Map(); // Stockage des demandes de signature en attente
const pendingRegistrationRequests = new Map();

async function deriveEncryptionKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptPrivateKey(privateKeyObj, password, salt, iv) {
    const toStore = { d: privateKeyObj.d.toString(), p: privateKeyObj.p.toString(), q: privateKeyObj.q.toString(), n: privateKeyObj.n.toString() };
    const encoded = new TextEncoder().encode(JSON.stringify(toStore));
    const key = await deriveEncryptionKey(password, salt);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return Array.from(new Uint8Array(encrypted));
}

async function decryptPrivateKey(encryptedData, password, salt, iv) {
    const key = await deriveEncryptionKey(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, new Uint8Array(encryptedData));
    const obj = JSON.parse(new TextDecoder().decode(decrypted));
    return { d: BigInt(obj.d), p: BigInt(obj.p), q: BigInt(obj.q), n: BigInt(obj.n) };
}

async function deriveAccountIdFromPublicKey(publicKeyJwk) {
    let pub = typeof publicKeyJwk === 'string' ? JSON.parse(publicKeyJwk) : publicKeyJwk;
    const sortedJwk = {};
    Object.keys(pub).sort().forEach(k => sortedJwk[k] = pub[k]);
    const normalizedKey = JSON.stringify(sortedJwk);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedKey));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 32);
}

async function generateAndStoreKeyPair() {
    const { publicKey, privateKey } = await generateRSAKeyPair(2048);
    const publicJwk = JSON.stringify({ n: publicKey.n.toString(), e: publicKey.e.toString() });
    return { publicJwk, privateKey };
}

async function createWallet(password) {
    console.log('🔵 [BACKGROUND] createWallet appelé');
    const personal = await generateAndStoreKeyPair();
    const sharing = await generateAndStoreKeyPair();
    const accounts = [
        { id: 'personal', type: 'personal', name: 'Espace personnel', icon: '👤', publicKey: personal.publicJwk, privateKey: personal.privateKey },
        { id: 'sharing', type: 'sharing', name: 'Espace de partage', icon: '👥', publicKey: sharing.publicJwk, privateKey: sharing.privateKey }
    ];
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedKeys = {};
    for (const acc of accounts) {
        encryptedKeys[acc.id] = await encryptPrivateKey(acc.privateKey, password, salt, iv);
        delete acc.privateKey;
    }
    const walletData = { version: 3, salt: Array.from(salt), iv: Array.from(iv), accounts: accounts.map(a => ({ id: a.id, type: a.type, name: a.name, icon: a.icon, publicKey: a.publicKey })), encryptedKeys };
    await chrome.storage.local.set({ wallet: walletData });
    const finalAccounts = [
        { ...accounts[0], keyPair: { publicKey: accounts[0].publicKey, privateKey: personal.privateKey } },
        { ...accounts[1], keyPair: { publicKey: accounts[1].publicKey, privateKey: sharing.privateKey } }
    ];
    walletState = { isUnlocked: true, accounts: finalAccounts, activeAccount: finalAccounts[0] };
    console.log('✅ [BACKGROUND] Wallet créé avec succès');
    return { accounts: finalAccounts.map(a => ({ id: a.id, name: a.name, type: a.type, icon: a.icon, publicKey: a.publicKey })) };
}

async function unlockWallet(password) {
    console.log('🔵 [BACKGROUND] unlockWallet appelé');
    const result = await chrome.storage.local.get('wallet');
    const walletData = result.wallet;
    if (!walletData) throw new Error('No wallet found');
    const salt = new Uint8Array(walletData.salt);
    const iv = new Uint8Array(walletData.iv);
    const accounts = [];
    for (const accInfo of walletData.accounts) {
        const encrypted = walletData.encryptedKeys[accInfo.id];
        const privateKey = await decryptPrivateKey(encrypted, password, salt, iv);
        accounts.push({ ...accInfo, keyPair: { publicKey: accInfo.publicKey, privateKey } });
    }
    walletState = { isUnlocked: true, accounts, activeAccount: accounts[0] };
    console.log('✅ [BACKGROUND] Wallet déverrouillé avec succès');
    return { accounts: accounts.map(a => ({ id: a.id, name: a.name, type: a.type, icon: a.icon, publicKey: a.publicKey })) };
}

function lockWallet() { 
    console.log('🔒 [BACKGROUND] Wallet verrouillé');
    walletState = { isUnlocked: false, accounts: [], activeAccount: null }; 
}

function getAllAccounts() { 
    if (!walletState.isUnlocked) return []; 
    return walletState.accounts.map(a => ({ id: a.id, name: a.name, type: a.type, icon: a.icon, publicKey: a.publicKey })); 
}

function getActiveAccount() { 
    if (!walletState.activeAccount) return null; 
    return { id: walletState.activeAccount.id, name: walletState.activeAccount.name, publicKey: walletState.activeAccount.publicKey }; 
}

function isUnlocked() { 
    return { unlocked: walletState.isUnlocked }; 
}

function switchAccount(accountId) { 
    const account = walletState.accounts.find(a => a.id === accountId); 
    if (!account) throw new Error('Account not found'); 
    walletState.activeAccount = account; 
    console.log(`✅ [BACKGROUND] Compte changé vers: ${account.name}`);
    return account; 
}

async function getAllPublicKeys() { 
    if (!walletState.isUnlocked) throw new Error('Wallet not unlocked'); 
    return { accounts: walletState.accounts.map(acc => ({ accountId: acc.id, accountName: acc.name, accountType: acc.type, accountIcon: acc.icon, publicKey: acc.publicKey, isActive: walletState.activeAccount?.id === acc.id })), count: walletState.accounts.length }; 
}

async function addAccount(name, type, password) {
    console.log('🔵 [BACKGROUND] addAccount appelé:', { name, type });
    if (!walletState.isUnlocked) throw new Error('Wallet not unlocked');
    const testAccount = walletState.accounts[0];
    const walletData = (await chrome.storage.local.get('wallet')).wallet;
    const salt = new Uint8Array(walletData.salt);
    const iv = new Uint8Array(walletData.iv);
    try {
        await decryptPrivateKey(walletData.encryptedKeys[testAccount.id], password, salt, iv);
    } catch(e) { 
        throw new Error('Mot de passe incorrect'); 
    }
    const { publicJwk, privateKey } = await generateAndStoreKeyPair();
    const newId = 'acc_' + Date.now();
    const newAccount = { id: newId, type: type || 'custom', name, icon: '🔑', publicKey: publicJwk, privateKey };
    walletData.accounts.push({ id: newId, type: type || 'custom', name, icon: '🔑', publicKey: publicJwk });
    walletData.encryptedKeys[newId] = await encryptPrivateKey(privateKey, password, salt, iv);
    await chrome.storage.local.set({ wallet: walletData });
    walletState.accounts.push({ ...newAccount, keyPair: { publicKey: publicJwk, privateKey } });
    console.log('✅ [BACKGROUND] Compte ajouté avec succès:', newId);
    return { id: newId, name, type, publicKey: publicJwk };
}

async function getAccountDetails(accountId, password) {
    console.log('🔵 [BACKGROUND] getAccountDetails appelé:', accountId);
    if (!walletState.isUnlocked) throw new Error('Wallet not unlocked');
    const account = walletState.accounts.find(a => a.id === accountId);
    if (!account) throw new Error('Account not found');
    const walletData = (await chrome.storage.local.get('wallet')).wallet;
    const salt = new Uint8Array(walletData.salt);
    const iv = new Uint8Array(walletData.iv);
    const encrypted = walletData.encryptedKeys[accountId];
    if (!encrypted) throw new Error('Clé privée manquante');
    const privateKey = await decryptPrivateKey(encrypted, password, salt, iv);
    return {
        publicKey: account.publicKey,
        privateKey: JSON.stringify({ d: privateKey.d.toString(), p: privateKey.p.toString(), q: privateKey.q.toString(), n: privateKey.n.toString() })
    };
}
//code qr
// Dérivation de clé AES (identique à deriveEncryptionKey, mais avec sel explicite)
async function deriveAESKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function exportAccount(accountId, password) {
    if (!walletState.isUnlocked) throw new Error('Wallet not unlocked');
    const account = walletState.accounts.find(a => a.id === accountId);
    if (!account) throw new Error('Account not found');

    // Récupérer la clé privée sous forme d'objet JSON
    let privateKeyObj;
    if (account.keyPair && account.keyPair.privateKey) {
        const pk = account.keyPair.privateKey;
        privateKeyObj = { d: pk.d.toString(), p: pk.p.toString(), q: pk.q.toString(), n: pk.n.toString() };
    } else {
        privateKeyObj = JSON.parse(account.privateKey);
    }
    const privateKeyString = JSON.stringify(privateKeyObj);
    const privateKeyBytes = new TextEncoder().encode(privateKeyString);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await deriveAESKey(password, salt);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, privateKeyBytes);

    const exportData = {
        name: account.name,
        type: account.type,
        icon: account.icon,
        publicKey: account.publicKey,
        encryptedPrivateKey: Array.from(new Uint8Array(encrypted)),
        iv: Array.from(iv),
        salt: Array.from(salt)
    };
    return { success: true, data: exportData };
}

async function importAccount(accountData, password) {
    if (!walletState.isUnlocked) throw new Error('Wallet not unlocked');
    const { name, type, icon, publicKey, encryptedPrivateKey, iv, salt } = accountData;
    if (!name || !publicKey || !encryptedPrivateKey) throw new Error('Données incomplètes');

    const aesKey = await deriveAESKey(password, new Uint8Array(salt));
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        aesKey,
        new Uint8Array(encryptedPrivateKey)
    );
    const privateKeyString = new TextDecoder().decode(decrypted);
    let privateKeyObj;
    try { privateKeyObj = JSON.parse(privateKeyString); } catch(e) { throw new Error('Format clé privée invalide'); }

    const privateKeyBigInt = {
        d: BigInt(privateKeyObj.d),
        p: BigInt(privateKeyObj.p),
        q: BigInt(privateKeyObj.q),
        n: BigInt(privateKeyObj.n),
        e: 65537n
    };
    // Générer ID unique
    let newId;
    do {
        newId = crypto.randomUUID ? crypto.randomUUID() : 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2);
    } while (walletState.accounts.find(a => a.id === newId));
    const newAccount = {
        id: newId,
        type: type || 'custom',
        name: name,
        icon: icon || '🔑',
        publicKey: publicKey,
        privateKey: privateKeyObj,
        keyPair: { publicKey: publicKey, privateKey: privateKeyBigInt }
    };

    // Sauvegarder dans le storage
    const walletData = (await chrome.storage.local.get('wallet')).wallet;
    const saltStorage = new Uint8Array(walletData.salt);
    const ivStorage = new Uint8Array(walletData.iv);
    const encryptedForStorage = await encryptPrivateKey(privateKeyBigInt, password, saltStorage, ivStorage);
    walletData.accounts.push({
        id: newId,
        type: newAccount.type,
        name: newAccount.name,
        icon: newAccount.icon,
        publicKey: publicKey
    });
    walletData.encryptedKeys[newId] = encryptedForStorage;
    await chrome.storage.local.set({ wallet: walletData });

    walletState.accounts.push(newAccount);
    return { success: true, id: newId };
}

// ========================= 10. GESTION DES CSR =========================
async function handleSignRegistration(payload, sendResponse) {
    const { email, password } = payload;
    console.log('🔵 [BACKGROUND] handleSignRegistration appelé');
    console.log('   - email:', email);

    if (!email) {
        sendResponse({ error: 'Email is required' });
        return true;
    }

    // Vérifier si wallet déverrouillé
    if (!walletState.isUnlocked) {
        console.log('🔒 [BACKGROUND] Wallet verrouillé, demande de déverrouillage pour registration');
        
        // Stocker la demande
        const requestId = 'reg_' + Date.now();
        pendingRegistrationRequests.set(requestId, {
            email: email,
            sendResponse: sendResponse,
            timestamp: Date.now()
        });
        
        // Ouvrir popup pour déverrouillage
        chrome.action.openPopup();
        
        // Envoyer message à la popup
        setTimeout(() => {
            chrome.runtime.sendMessage({
                type: 'PENDING_REGISTRATION',
                requestId: requestId,
                email: email
            }).catch(() => console.log('Popup pas encore prête'));
        }, 500);
        
        return true;
    }

    // Wallet déverrouillé, procéder à la génération des CSR
    await executeSignRegistration(email, sendResponse);
    return true;
}

async function executeSignRegistration(email, sendResponse) {
    console.log(`🔵 [BACKGROUND] Génération CSR pour email: ${email}`);
    console.log(`🔵 [BACKGROUND] Nombre de comptes: ${walletState.accounts.length}`);

    const csrs = [];
    
    for (const account of walletState.accounts) {
        console.log(`🔵 [BACKGROUND] Génération CSR pour compte: ${account.id}`);
        
        let publicKeyObj;
        try {
            publicKeyObj = typeof account.publicKey === 'string' 
                ? JSON.parse(account.publicKey) 
                : account.publicKey;
        } catch (e) {
            publicKeyObj = account.publicKey;
        }
        
        const certificationRequestInfo = {
            walletAccount: {
                id: account.id,
                type: account.type,
                name: account.name,
                publicKey: publicKeyObj
            },
            email,
            timestamp: Date.now()
        };

        const infoString = normalizeAndStringify(certificationRequestInfo);
        console.log(`🔵 [BACKGROUND] infoString (début): ${infoString.substring(0, 150)}...`);
        
        const signature = await signMessage(infoString, account.keyPair.privateKey);
        
        csrs.push({
            certificationRequestInfo,
            signature,
            accountId: account.id,
            publicKey: account.publicKey
        });
    }

    console.log(`✅ ${csrs.length} CSR(s) générés avec succès`);
    
    sendResponse({
        success: true,
        csrs: csrs,
        count: csrs.length
    });
}

// ========================= 11. GESTION DES SIGNATURES DE CHALLENGE =========================
async function handleSignChallenge(payload, requestId, sendResponse) {
    console.log('🔵 [BACKGROUND] handleSignChallenge appelé');
    console.log('   - requestId:', requestId);
    console.log('   - accountId:', payload.accountId);
    console.log('   - challenge (début):', payload.challenge?.substring(0, 50) + '...');
    console.log('   - nonce:', payload.nonce);
    console.log('   - timestamp:', payload.timestamp);
    console.log('   - site:', payload.site);
    
    // Vérifier si le wallet est déverrouillé
    if (!walletState.isUnlocked) {
        console.log('🔒 [BACKGROUND] Wallet verrouillé, demande de déverrouillage');
        
        // Stocker la demande en attente
        pendingSignRequests.set(requestId, {
            action: 'sign',
            payload: payload,
            sendResponse: sendResponse,
            timestamp: Date.now()
        });
        
        // Ouvrir la popup pour demander le mot de passe
        console.log('🔓 [BACKGROUND] Ouverture popup pour déverrouillage...');
        chrome.action.openPopup();
        
        // Envoyer un message à la popup pour qu'elle affiche la demande
        setTimeout(() => {
            chrome.runtime.sendMessage({
                type: 'PENDING_REQUEST',
                requestId: requestId,
                action: 'sign',
                accountId: payload.accountId,
                site: payload.site,
                challenge: payload.challenge,
                nonce: payload.nonce,
                timestamp: payload.timestamp
            }).catch(() => console.log('Popup pas encore prête'));
        }, 500);
        
        return true; // Réponse asynchrone
    }
    
    // Wallet déverrouillé, procéder à la signature
    await executeSignChallenge(payload, requestId, sendResponse);
    return true;
}

async function executeSignChallenge(payload, requestId, sendResponse) {
    console.log('🔵 [BACKGROUND] executeSignChallenge - Début signature');
    
    try {
        const { accountId, challenge, nonce, timestamp, site } = payload;
        
        // Trouver le compte
        const account = walletState.accounts.find(a => a.id === accountId);
        if (!account) {
            throw new Error(`Account not found: ${accountId}`);
        }
        
        console.log(`🔐 [BACKGROUND] Signature avec compte: ${account.name} (${account.id})`);
        
        // Reconstruire le message original
        const originalMessage = `${challenge}:${nonce}:${timestamp}`;
        console.log(`📝 [BACKGROUND] Message à signer: ${originalMessage.substring(0, 100)}...`);
        
        // Signer le challenge
        const signature = await signMessage(originalMessage, account.keyPair.privateKey);
        
        console.log(`✅ [BACKGROUND] Signature réussie`);
        console.log(`   - signature (début): ${signature.substring(0, 50)}...`);
        
        // Récupérer la clé publique au format JWK
        let publicKey = account.publicKey;
        if (typeof publicKey === 'string') {
            try {
                publicKey = JSON.parse(publicKey);
            } catch (e) {
                // Déjà un objet ou erreur
            }
        }
        
       //jai enleve la cle publique
        sendResponse({
            success: true,
            signature: signature,
            accountId: account.id,
        });
        
        // Nettoyer la demande en attente si elle existe
        if (pendingSignRequests.has(requestId)) {
            pendingSignRequests.delete(requestId);
        }
        
    } catch (error) {
        console.error('❌ [BACKGROUND] Erreur signature:', error);
        sendResponse({ error: error.message });
        
        if (pendingSignRequests.has(requestId)) {
            pendingSignRequests.delete(requestId);
        }
    }
}

// Fonction pour déverrouiller et signer une demande en attente
async function unlockAndSign(password, requestId) {
    console.log('🔵 [BACKGROUND] unlockAndSign appelé');
    console.log('   - requestId:', requestId);
    
    const pendingRequest = pendingSignRequests.get(requestId);
    if (!pendingRequest) {
        console.log('❌ [BACKGROUND] Aucune demande en attente pour:', requestId);
        return { success: false, error: 'No pending request found' };
    }
    
    try {
        // Déverrouiller le wallet
        await unlockWallet(password);
        console.log('✅ [BACKGROUND] Wallet déverrouillé avec succès');
        
        // Exécuter la signature
        await executeSignChallenge(pendingRequest.payload, requestId, pendingRequest.sendResponse);
        
        return { success: true };
        
    } catch (error) {
        console.error('❌ [BACKGROUND] Erreur unlockAndSign:', error);
        if (pendingRequest.sendResponse) {
            pendingRequest.sendResponse({ error: error.message });
        }
        pendingSignRequests.delete(requestId);
        return { success: false, error: error.message };
    }
}

// Fonction pour déverrouiller et générer des CSR
async function unlockAndRegister(password, requestId) {
    console.log('🔵 [BACKGROUND] unlockAndRegister appelé');
    console.log('   - requestId:', requestId);
    
    const pendingRequest = pendingRegistrationRequests.get(requestId);
    if (!pendingRequest) {
        console.log('❌ [BACKGROUND] Aucune demande en attente pour:', requestId);
        return { success: false, error: 'No pending request found' };
    }
    
    try {
        // Déverrouiller le wallet
        await unlockWallet(password);
        console.log('✅ [BACKGROUND] Wallet déverrouillé avec succès');
        
        // Exécuter la génération des CSR
        await executeSignRegistration(pendingRequest.email, pendingRequest.sendResponse);
        
        pendingRegistrationRequests.delete(requestId);
        return { success: true };
        
    } catch (error) {
        console.error('❌ [BACKGROUND] Erreur unlockAndRegister:', error);
        if (pendingRequest.sendResponse) {
            pendingRequest.sendResponse({ error: error.message });
        }
        pendingRegistrationRequests.delete(requestId);
        return { success: false, error: error.message };
    }
}

// Récupérer les demandes en attente
function getPendingRequests() {
    const requests = [];
    for (const [id, req] of pendingSignRequests.entries()) {
        requests.push({
            requestId: id,
            action: req.action,
            accountId: req.payload?.accountId,
            site: req.payload?.site,
            timestamp: req.timestamp
        });
    }
    return requests;
}

function getPendingRegistrations() {
    const requests = [];
    for (const [id, req] of pendingRegistrationRequests.entries()) {
        requests.push({
            requestId: id,
            email: req.email,
            timestamp: req.timestamp
        });
    }
    return requests;
}

// Annuler une demande en attente
function cancelPendingRequest(requestId) {
    const pending = pendingSignRequests.get(requestId);
    if (pending && pending.sendResponse) {
        pending.sendResponse({ error: 'Request cancelled by user' });
    }
    return pendingSignRequests.delete(requestId);
}

function cancelPendingRegistration(requestId) {
    const pending = pendingRegistrationRequests.get(requestId);
    if (pending && pending.sendResponse) {
        pending.sendResponse({ error: 'Registration cancelled by user' });
    }
    return pendingRegistrationRequests.delete(requestId);
}

// ========================= 12. LISTENER PRINCIPAL =========================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('📨 [BACKGROUND] Message reçu:', msg.action);
    
    (async () => {
        try {
            switch (msg.action) {
                case 'exportAccount':
                    sendResponse(await exportAccount(msg.payload.accountId, msg.payload.password));
                    break;
                case 'importAccount':
                    sendResponse(await importAccount(msg.payload.accountData, msg.payload.password));
                    break;

                     case 'getAESKeyBothVersions': {
    console.log('🔑 [getAESKeyBothVersions] Début');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    try {
        const { accountId, encryptedKey } = msg.payload;
        console.log('📦 Paramètres reçus:', {
            accountId: accountId,
            encryptedKeyLength: encryptedKey?.length,
            encryptedKeyType: typeof encryptedKey,
            encryptedKey: encryptedKey?.slice(0, 20) // Afficher les 20 premiers éléments
        });
        
        // ========== VÉRIFICATION CRITIQUE: encryptedKey ne doit pas être vide ==========
        if (!encryptedKey || !Array.isArray(encryptedKey) || encryptedKey.length === 0) {
            console.error('❌ encryptedKey est vide ou invalide!');
            console.log('   encryptedKey:', encryptedKey);
            throw new Error('Encryption key is empty or invalid. Please make sure the file/folder is properly encrypted.');
        }
        
        // ========== ÉTAPE 1: VÉRIFIER QUE LE WALLET EST DÉVERROUILLÉ ==========
        if (!walletState.isUnlocked) {
            console.error('❌ Wallet non déverrouillé');
            throw new Error('Wallet is locked. Please unlock first.');
        }
        
        // ========== ÉTAPE 2: VÉRIFIER QUE LES COMPTES EXISTENT ==========
        if (!walletState.accounts || walletState.accounts.length === 0) {
            console.error('❌ Aucun compte dans walletState');
            throw new Error('No accounts found. Please unlock wallet again.');
        }
        
        console.log(`📊 ${walletState.accounts.length} compte(s) trouvé(s) dans walletState`);
        
        // Afficher tous les comptes disponibles
        walletState.accounts.forEach((acc, idx) => {
            console.log(`   Compte ${idx + 1}:`, {
                id: acc.id,
                name: acc.name,
                accountType: acc.accountType,
                type: acc.type,
                hasKeyPair: !!acc.keyPair,
                privateKeyType: typeof acc.keyPair?.privateKey,
                publicKeyType: typeof acc.keyPair?.publicKey
            });
        });
        
        // ========== ÉTAPE 3: TROUVER LE COMPTE SOURCE (PERSONAL) ==========
        console.log(`🔍 Recherche du compte source avec ID: ${accountId}`);
        const sourceAccount = walletState.accounts.find(a => a.id === accountId);
        
        if (!sourceAccount) {
            console.error(`❌ Compte source non trouvé pour ID: ${accountId}`);
            throw new Error(`Account not found with ID: ${accountId}`);
        }
        
        console.log('✅ Compte source trouvé:', {
            id: sourceAccount.id,
            name: sourceAccount.name,
            accountType: sourceAccount.accountType,
            type: sourceAccount.type
        });
        
        // ========== ÉTAPE 4: TROUVER LE COMPTE SHARING ==========
        console.log('🔍 Recherche du compte sharing...');
        
        let sharingAccount = null;
        
        // Méthode 1: Par type
        sharingAccount = walletState.accounts.find(a => a.type === 'sharing');
        if (sharingAccount) {
            console.log('✅ Compte sharing trouvé par type="sharing"');
        }
        
        // Méthode 2: Par accountType
        if (!sharingAccount) {
            sharingAccount = walletState.accounts.find(a => a.accountType === 'sharing');
            if (sharingAccount) {
                console.log('✅ Compte sharing trouvé par accountType="sharing"');
            }
        }
        
        if (!sharingAccount) {
            console.error('❌ Compte sharing non trouvé');
            throw new Error('Sharing account not found in wallet');
        }
        
        console.log('✅ Compte sharing trouvé:', {
            id: sharingAccount.id,
            name: sharingAccount.name,
            accountType: sharingAccount.accountType,
            type: sharingAccount.type
        });
        
        // ========== ÉTAPE 5: RÉCUPÉRER LES CLÉS RSA ==========
        console.log('🔑 Récupération des clés RSA...');
        
        // Récupérer la clé privée du compte source
        let sourcePrivateKey = null;
        if (sourceAccount.keyPair && sourceAccount.keyPair.privateKey) {
            sourcePrivateKey = sourceAccount.keyPair.privateKey;
            console.log('✅ Clé privée source trouvée dans keyPair');
            console.log('   Type:', typeof sourcePrivateKey);
            console.log('   Est un objet?', typeof sourcePrivateKey === 'object');
            console.log('   Propriétés:', Object.keys(sourcePrivateKey));
        } else if (sourceAccount.privateKey) {
            sourcePrivateKey = sourceAccount.privateKey;
            console.log('✅ Clé privée source trouvée directement');
            console.log('   Type:', typeof sourcePrivateKey);
        } else {
            throw new Error('Source account private key not found');
        }
        
        // Récupérer la clé publique du compte sharing
        let sharingPublicKey = null;
        if (sharingAccount.keyPair && sharingAccount.keyPair.publicKey) {
            sharingPublicKey = sharingAccount.keyPair.publicKey;
            console.log('✅ Clé publique sharing trouvée dans keyPair');
            console.log('   Type:', typeof sharingPublicKey);
            console.log('   Propriétés:', Object.keys(sharingPublicKey));
        } else if (sharingAccount.publicKey) {
            sharingPublicKey = sharingAccount.publicKey;
            console.log('✅ Clé publique sharing trouvée directement');
            console.log('   Type:', typeof sharingPublicKey);
        } else {
            throw new Error('Sharing account public key not found');
        }
        
        // ========== ÉTAPE 6: TRAITEMENT DES CLÉS RSA ==========
        console.log('🔧 Traitement des clés RSA...');
        
        let priv, sharingPub;
        
        // Traitement de la clé privée source
        if (typeof sourcePrivateKey === 'object' && sourcePrivateKey !== null) {
            console.log('✅ sourcePrivateKey est déjà un objet, utilisation directe');
            priv = sourcePrivateKey;
        } else if (typeof sourcePrivateKey === 'string') {
            console.log('🔧 sourcePrivateKey est une chaîne, parsing JSON...');
            try {
                priv = JSON.parse(sourcePrivateKey);
                console.log('✅ JSON parsé avec succès');
            } catch (e) {
                console.error('❌ Erreur parsing JSON:', e);
                throw new Error('Invalid source private key format');
            }
        } else {
            console.error('❌ Format sourcePrivateKey non supporté:', typeof sourcePrivateKey);
            throw new Error('Unsupported source private key format');
        }
        
        // Traitement de la clé publique sharing
        if (typeof sharingPublicKey === 'object' && sharingPublicKey !== null) {
            console.log('✅ sharingPublicKey est déjà un objet, utilisation directe');
            sharingPub = sharingPublicKey;
        } else if (typeof sharingPublicKey === 'string') {
            console.log('🔧 sharingPublicKey est une chaîne, parsing JSON...');
            try {
                sharingPub = JSON.parse(sharingPublicKey);
                console.log('✅ JSON parsé avec succès');
            } catch (e) {
                console.error('❌ Erreur parsing JSON:', e);
                throw new Error('Invalid sharing public key format');
            }
        } else {
            console.error('❌ Format sharingPublicKey non supporté:', typeof sharingPublicKey);
            throw new Error('Unsupported sharing public key format');
        }
        
        // Afficher les propriétés disponibles
        console.log('📋 Propriétés de priv:', Object.keys(priv));
        console.log('📋 Propriétés de sharingPub:', Object.keys(sharingPub));
        
        // Vérifier que les clés ont les propriétés minimales requises
        if (!priv.n || !priv.d) {
            console.error('❌ Clé privée manque de propriétés requises (n, d)');
            console.log('   n présent?', !!priv.n);
            console.log('   d présent?', !!priv.d);
            throw new Error('Source private key missing required fields (n, d)');
        }
        
        if (!sharingPub.n || !sharingPub.e) {
            console.error('❌ Clé publique sharing manque de propriétés requises (n, e)');
            console.log('   n présent?', !!sharingPub.n);
            console.log('   e présent?', !!sharingPub.e);
            throw new Error('Sharing public key missing required fields (n, e)');
        }
        
        console.log('✅ Clés validées avec succès');
        
        // ========== ÉTAPE 7: CONSTRUIRE LES CLÉS RSA POUR LE DÉCHIFFREMENT ==========
        console.log('🏗️ Construction des clés RSA pour crypto...');
        
        const rsaPrivateKey = {
            n: BigInt(priv.n),
            d: BigInt(priv.d)
        };
        
        // Ajouter les propriétés optionnelles si elles existent
        if (priv.p && priv.q) {
            rsaPrivateKey.p = BigInt(priv.p);
            rsaPrivateKey.q = BigInt(priv.q);
            console.log('✅ Propriétés p et q ajoutées');
        }
        
        if (priv.dp && priv.dq && priv.qi) {
            rsaPrivateKey.dp = BigInt(priv.dp);
            rsaPrivateKey.dq = BigInt(priv.dq);
            rsaPrivateKey.qi = BigInt(priv.qi);
            console.log('✅ Propriétés dp, dq, qi ajoutées');
        }
        
        const rsaPublicKey = {
            n: BigInt(sharingPub.n),
            e: BigInt(sharingPub.e)
        };
        
        console.log('✅ Clés RSA construites');
        console.log('   RSA Private Key n:', rsaPrivateKey.n.toString(16).substring(0, 30));
        console.log('   RSA Private Key d:', rsaPrivateKey.d.toString(16).substring(0, 30));
        console.log('   RSA Public Key n:', rsaPublicKey.n.toString(16).substring(0, 30));
        console.log('   RSA Public Key e:', rsaPublicKey.e.toString());
        
        // ========== ÉTAPE 8: DÉCHIFFRER LA CLÉ AES ==========
        console.log('🔓 Déchiffrement de la clé AES avec clé privée source...');
        
        // Vérifier à nouveau que encryptedKey n'est pas vide avant conversion
        if (encryptedKey.length === 0) {
            throw new Error('Encrypted key array is empty. Cannot decrypt.');
        }
        
        const encryptedBytes = new Uint8Array(encryptedKey);
        console.log(`📦 encryptedBytes length: ${encryptedBytes.length}`);
        console.log(`📦 encryptedBytes preview: ${Array.from(encryptedBytes.slice(0, 10)).join(', ')}...`);
        
        // Vérifier que les bytes ne sont pas tous zéro
        const isAllZeros = encryptedBytes.every(byte => byte === 0);
        if (isAllZeros) {
            console.error('❌ encryptedBytes contient seulement des zéros!');
            throw new Error('Encrypted key contains only zeros. Data is corrupted.');
        }
        
        const encryptedBigInt = bytesToBigInt(encryptedBytes);
        console.log(`🔢 encryptedBigInt: ${encryptedBigInt.toString(16).substring(0, 50)}...`);
        
        const decryptedBigInt = rsaDecrypt(encryptedBigInt, rsaPrivateKey);
        console.log(`🔢 decryptedBigInt: ${decryptedBigInt.toString(16).substring(0, 50)}...`);
        
        const decryptedKeyBytes = bigIntToBytes(decryptedBigInt);
        console.log(`✅ Clé AES déchiffrée: ${decryptedKeyBytes.length} bytes`);
        
        // Vérifier que la clé déchiffrée a une taille raisonnable (clé AES = 32 bytes pour AES-256)
        if (decryptedKeyBytes.length !== 32) {
            console.warn(`⚠️ La clé déchiffrée a une taille inhabituelle: ${decryptedKeyBytes.length} bytes (attendu: 32 bytes)`);
        }
        
        // ========== ÉTAPE 9: RECHIFFRER AVEC CLÉ PUBLIQUE SHARING ==========
        console.log('🔐 Rechiffrement de la clé AES avec clé publique sharing...');
        
        const decryptedForSharing = bytesToBigInt(decryptedKeyBytes);
        const reencryptedBigInt = rsaEncrypt(decryptedForSharing, rsaPublicKey);
        const reencryptedKeyBytes = bigIntToBytes(reencryptedBigInt);
        
        console.log(`✅ Clé AES rechiffrée: ${reencryptedKeyBytes.length} bytes`);
        
        // ========== ÉTAPE 10: PRÉPARER LA RÉPONSE ==========
        const responseData = {
            decryptedKey: Array.from(decryptedKeyBytes),
            reencryptedKey: Array.from(reencryptedKeyBytes)
        };
        
        console.log('📤 Envoi de la réponse');
        sendResponse(responseData);
        console.log('✅ [getAESKeyBothVersions] Terminé avec succès');
        
    } catch (error) {
        console.error('❌ [getAESKeyBothVersions] Erreur:', error);
        console.error('Stack:', error.stack);
        sendResponse({ 
            error: error.message,
            success: false 
        });
    }
    break;
}



                // case 'getAESKeyBothVersions': {
                //         console.log('🔑 [getAESKeyBothVersions] Début');
                //         const { accountId, encryptedKey } = msg.payload;
                        
                //         // Trouver le compte source (personal)
                //         const sourceAccount = walletState.accounts.find(a => a.id === accountId);
                //         if (!sourceAccount) throw new Error('Account not found');
                        
                //         // Trouver le compte de partage (sharing)
                //         const sharingAccount = walletState.accounts.find(a => a.type === 'share');
                //         if (!sharingAccount) throw new Error('Sharing account not found');
                        
                //         console.log('✅ Comptes trouvés:', {
                //             source: sourceAccount.name,
                //             sharing: sharingAccount.name
                //         });
                        
                //         // 1. Déchiffrer la clé AES avec la clé privée du compte source
                //         const priv = JSON.parse(sourceAccount.privateKey);
                //         const rsaPrivateKey = {
                //             n: BigInt(priv.n),
                //             d: BigInt(priv.d),
                //             p: BigInt(priv.p),
                //             q: BigInt(priv.q),
                //             dp: BigInt(priv.dp),
                //             dq: BigInt(priv.dq),
                //             qi: BigInt(priv.qi)
                //         };
                        
                //         const encryptedBytes = new Uint8Array(encryptedKey);
                //         const encryptedBigInt = bytesToBigInt(encryptedBytes);
                //         const decryptedBigInt = rsaDecrypt(encryptedBigInt, rsaPrivateKey);
                //         const decryptedKeyBytes = bigIntToBytes(decryptedBigInt);
                        
                //         console.log(`✅ Clé AES déchiffrée: ${decryptedKeyBytes.length} bytes`);
                        
                //         // 2. Rechiffrer avec la clé publique du compte sharing
                //         const sharingPub = JSON.parse(sharingAccount.publicKey);
                //         const rsaPublicKey = {
                //             n: BigInt(sharingPub.n),
                //             e: BigInt(sharingPub.e)
                //         };
                        
                //         const decryptedForSharing = bytesToBigInt(decryptedKeyBytes);
                //         const reencryptedBigInt = rsaEncrypt(decryptedForSharing, rsaPublicKey);
                //         const reencryptedKeyBytes = bigIntToBytes(reencryptedBigInt);
                        
                //         console.log(`✅ Clé AES rechiffrée avec clé sharing: ${reencryptedKeyBytes.length} bytes`);
                        
                //         // Retourner les deux versions
                //         sendResponse({
                //             decryptedKey: Array.from(decryptedKeyBytes),     // Clé déchiffrée (sans RSA)
                //             reencryptedKey: Array.from(reencryptedKeyBytes)  // Clé rechiffrée avec clé sharing
                //         });
                //         break;
                //     }
                case 'decryptAESKey': {
                const { encryptedKey, accountId } = msg.payload;

                const account = walletState.accounts.find(a => a.id === accountId);
                if (!account) throw new Error('Account not found');

                const pub = JSON.parse(account.publicKey);

                const privateKey = account.keyPair.privateKey;

                const c = bytesToBigInt(new Uint8Array(encryptedKey));
                const m = rsaDecrypt(c, privateKey);

                const aesKeyBytes = bigIntToBytes(m);
                
                sendResponse({
                    success: true,
                    aesKey: Array.from(aesKeyBytes)
                });
                break;
            }
            case 'encryptAESKey': {
                const { data, accountId } = msg.payload;

                const account = walletState.accounts.find(a => a.id === accountId);
                if (!account) throw new Error('Account not found');

                const pub = JSON.parse(account.publicKey);

                const rsaPublicKey = {
                    n: BigInt(pub.n),
                    e: BigInt(pub.e)
                };

                const m = bytesToBigInt(new Uint8Array(data));
                const encrypted = rsaEncrypt(m, rsaPublicKey);
                const encryptedBytes = bigIntToBytes(encrypted);

                sendResponse(Array.from(encryptedBytes));
                break;
            }
                case 'signRegistration':
                    await handleSignRegistration(msg.payload, sendResponse);
                    break;
                case 'openPopup':
                    console.log('🔵 [BACKGROUND] openPopup received');
                    chrome.action.openPopup();
                    sendResponse({ success: true });
                    break;
                case 'createWallet': 
                    sendResponse(await createWallet(msg.password));
                    break;
                case 'unlockWallet': 
                    sendResponse(await unlockWallet(msg.payload.password));
                    break;
                case 'lock': 
                    lockWallet(); 
                    sendResponse({ success: true });
                    break;
                case 'getAllAccounts': 
                    sendResponse(getAllAccounts());
                    break;
                case 'getActiveAccount': 
                    sendResponse(getActiveAccount());
                    break;
                case 'isUnlocked': 
                    sendResponse(isUnlocked());
                    break;
                case 'switchAccount': 
                    sendResponse(switchAccount(msg.payload.accountId));
                    break;
                case 'addAccount': 
                    sendResponse(await addAccount(msg.payload.name, msg.payload.type, msg.payload.password));
                    break;
                case 'getAccountDetails': 
                    sendResponse(await getAccountDetails(msg.payload.accountId, msg.payload.password));
                    break;
                case 'encrypt': 
                    sendResponse(await encryptFile(msg.payload.file, msg.payload.publicKey));
                    break;
                case 'decrypt': 
                    sendResponse(await decryptFile(msg.payload.encryptedData));
                    break;
                case 'getAllPublicKeys': 
                    sendResponse(await getAllPublicKeys());
                    break;
                case 'signChallenge': 
                    await handleSignChallenge(msg.payload, msg.requestId, sendResponse);
                    break;
                case 'unlockAndSign': 
                    sendResponse(await unlockAndSign(msg.payload.password, msg.payload.requestId));
                    break;
                case 'unlockAndRegister':
                    sendResponse(await unlockAndRegister(msg.payload.password, msg.payload.requestId));
                    break;
                case 'getPendingRequests': 
                    sendResponse({ requests: getPendingRequests() });
                    break;
                case 'getPendingRegistrations':
                    sendResponse({ requests: getPendingRegistrations() });
                    break;
                case 'cancelPendingRequest': 
                    sendResponse({ success: cancelPendingRequest(msg.payload.requestId) });
                    break;
                case 'cancelPendingRegistration':
                    sendResponse({ success: cancelPendingRegistration(msg.payload.requestId) });
                    break;
                default: 
                    sendResponse({ error: 'Unknown action: ' + msg.action });
            }
        } catch (error) { 
            console.error('❌ [BACKGROUND] Erreur:', error); 
            sendResponse({ error: error.message }); 
        }
    })();
    return true;
});

console.log('✅ Background avec RSA manuel, addAccount, getAccountDetails, signChallenge, unlockAndSign, unlockAndRegister');
console.log('🔐 Extension SecureCloud prête !');