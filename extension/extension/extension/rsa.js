// rsa.js - Implémentation maison de RSA (BigInt)
// Toutes les fonctions utilisent BigInt pour les grands nombres.

// ---------- Utilitaires ----------
function modPow(base, exponent, modulus) {
    // Exponentiation modulaire rapide (square-and-multiply)
    // Retourne (base^exponent) % modulus
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

function modInverse(a, m) {
    // Inverse modulaire par algorithme d'Euclide étendu
    // Retourne x tel que a*x ≡ 1 mod m
    let [old_r, r] = [a, m];
    let [old_s, s] = [1n, 0n];
    let [old_t, t] = [0n, 1n];
    while (r !== 0n) {
        const q = old_r / r;
        [old_r, r] = [r, old_r - q * r];
        [old_s, s] = [s, old_s - q * s];
        [old_t, t] = [t, old_t - q * t];
    }
    // old_r = pgcd(a,m) = 1
    return (old_s % m + m) % m;
}

// ---------- Test de primalité de Miller-Rabin ----------
function isProbablePrime(n, k = 40) {
    // n > 2, impair
    if (n === 2n || n === 3n) return true;
    if (n < 2n || n % 2n === 0n) return false;

    // Écrire n-1 = 2^s * d avec d impair
    let d = n - 1n;
    let s = 0n;
    while (d % 2n === 0n) {
        d /= 2n;
        s++;
    }

    // Témoins
    witnessLoop: for (let i = 0; i < k; i++) {
        // Choisir a aléatoire entre 2 et n-2
        const a = randomBigInt(2n, n - 2n);
        let x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) continue;
        for (let r = 1n; r < s; r++) {
            x = (x * x) % n;
            if (x === n - 1n) continue witnessLoop;
        }
        return false;
    }
    return true;
}

// Génération d'un BigInt aléatoire dans [min, max]
function randomBigInt(min, max) {
    const range = max - min + 1n;
    const bits = range.toString(2).length;
    let result;
    do {
        result = 0n;
        for (let i = 0; i < bits; i += 32) {
            const rand = BigInt('0x' + [...crypto.getRandomValues(new Uint32Array(8))].map(x => x.toString(16).padStart(8, '0')).join(''));
            result = (result << 32n) | (rand & 0xffffffffn);
        }
        result = result % range;
    } while (result < 0n || result > range);
    return min + result;
}

// Génération d'un nombre premier de `bits` bits (avec bit de poids fort = 1)
function generatePrime(bits) {
    while (true) {
        // On crée un nombre impair de `bits` bits
        let candidate = 0n;
        // bit de poids fort à 1
        candidate |= 1n << BigInt(bits - 1);
        // bits aléatoires pour le milieu
        for (let i = 1; i < bits - 1; i++) {
            if (Math.random() < 0.5) candidate |= 1n << BigInt(i);
        }
        // bit de poids faible à 1 (impair)
        candidate |= 1n;
        // Vérifier primalité
        if (isProbablePrime(candidate)) return candidate;
        // Sinon on incrémente de 2
        candidate += 2n;
        while (candidate < (1n << BigInt(bits))) {
            if (isProbablePrime(candidate)) return candidate;
            candidate += 2n;
        }
    }
}

// ---------- Génération d'une paire RSA ----------
function generateRSAKeyPair(bits = 2048) {
    // bits : taille de n (ex: 2048)
    // p et q auront environ bits/2 bits chacun
    const halfBits = bits / 2;
    let p, q;
    do {
        p = generatePrime(halfBits);
        q = generatePrime(halfBits);
    } while (p === q);
    const n = p * q;
    const phi = (p - 1n) * (q - 1n);

    // Choisir e (public) : souvent 65537 (2^16+1) qui a deux bits à 1
    // Mais on peut aussi en générer un aléatoire impair avec peu de bits à 1
    let e = 65537n;
    // Vérifier que e est premier avec phi
    while (gcd(e, phi) !== 1n) {
        e += 2n; // prochain impair
    }

    const d = modInverse(e, phi);

    // Retourner les composants
    return {
        p, q, n, e, d,
        // Utile pour CRT: dp = d mod (p-1), dq = d mod (q-1), qInv = q^{-1} mod p
        dp: d % (p - 1n),
        dq: d % (q - 1n),
        qInv: modInverse(q, p)
    };
}

function gcd(a, b) {
    while (b !== 0n) {
        const t = a % b;
        a = b;
        b = t;
    }
    return a;
}

// ---------- Chiffrement RSA (public) ----------
function rsaEncrypt(messageBigInt, n, e) {
    // messageBigInt < n
    return modPow(messageBigInt, e, n);
}

// ---------- Déchiffrement RSA avec optimisation CRT ----------
function rsaDecrypt(cipherBigInt, keyPair) {
    // keyPair doit contenir p, q, dp, dq, qInv
    const { p, q, dp, dq, qInv } = keyPair;
    // Calcul mod p et mod q
    const m1 = modPow(cipherBigInt, dp, p);
    const m2 = modPow(cipherBigInt, dq, q);
    // Combinaison CRT: m = m2 + q * ((m1 - m2) * qInv mod p)
    let h = (m1 - m2) % p;
    if (h < 0n) h += p;
    h = (h * qInv) % p;
    const m = m2 + q * h;
    return m;
}

// Conversion d'un ArrayBuffer (fichier) en BigInt
function bufferToBigInt(buffer) {
    const hex = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return BigInt('0x' + hex);
}

function bigIntToBuffer(bigInt) {
    let hex = bigInt.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    return bytes.buffer;
}