class ExtensionService {

  static isAvailable() {
    return typeof window.myWallet !== 'undefined';
  }

static async ensureUnlocked() {
  while (true) {
    const status = await window.myWallet.isUnlocked();

    if (status.unlocked) return true;

    if (window.myWallet.openPopup) {
      await window.myWallet.openPopup();
    }

    // ⏳ attendre avant retry
    await new Promise(res => setTimeout(res, 1000));
  }
}
  // 🔐 Chiffrement AES key via extension
  static async encryptAESKey(aesKeyRaw, accountId = 'personal') {
    if (!this.isAvailable()) {
      throw new Error("Extension non disponible");
    }

    await this.ensureUnlocked();

    const result = await window.myWallet.send('encryptAESKey', {
      data: Array.from(aesKeyRaw),
      accountId
    });

    return new Uint8Array(result);
  }
// ExtensionService.js
static async getAESKeyBothVersions(encryptedKeyBase64, accountId = 'personal') {
    console.log('🔑 [ExtensionService] getAESKeyBothVersions appelé');
    console.log('   - accountId:', accountId);
    console.log('   - encryptedKeyBase64 length:', encryptedKeyBase64?.length);
    
    if (!this.isAvailable()) {
        throw new Error("Extension non disponible");
    }
    
    await this.ensureUnlocked();
    
    // Convertir base64 en Uint8Array
    let encryptedKeyBytes;
    if (typeof encryptedKeyBase64 === 'string') {
        const binaryString = atob(encryptedKeyBase64);
        encryptedKeyBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            encryptedKeyBytes[i] = binaryString.charCodeAt(i);
        }
    } else if (encryptedKeyBase64 instanceof Uint8Array) {
        encryptedKeyBytes = encryptedKeyBase64;
    } else {
        throw new Error("Format de clé non supporté");
    }
    
    console.log('📤 Envoi de la requête à l\'extension...');
    
    const result = await window.myWallet.send('getAESKeyBothVersions', {
        accountId: accountId,
        encryptedKey: Array.from(encryptedKeyBytes)
    });
    
    console.log('✅ Réponse reçue de l\'extension');
    console.log('   - decryptedKey length:', result.decryptedKey?.length);
    console.log('   - reencryptedKey length:', result.reencryptedKey?.length);
    
    return {
        decryptedKey: new Uint8Array(result.decryptedKey),
        reencryptedKey: new Uint8Array(result.reencryptedKey)
    };
}

  //dechiffrer la cle aes
// Garder l'ancienne méthode pour compatibilité
static async decryptAESKey(encryptedKeyBase64, accountId = 'personal') {
    console.log('🔵 [ExtensionService] decryptAESKey START');

    if (!this.isAvailable()) {
        throw new Error("Extension non disponible");
    }

    await this.ensureUnlocked();
    console.log('🔓 Wallet unlocked');

    // =========================
    // 1. Base64 → bytes
    // =========================
    let encryptedKeyBytes;

    if (typeof encryptedKeyBase64 === 'string') {
        const binaryString = atob(encryptedKeyBase64);
        encryptedKeyBytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
            encryptedKeyBytes[i] = binaryString.charCodeAt(i);
        }
    } else {
        encryptedKeyBytes = encryptedKeyBase64;
    }

    console.log('📦 encryptedKeyBytes length:', encryptedKeyBytes.length);

    // =========================
    // 2. CALL EXTENSION
    // =========================
    const result = await window.myWallet.send('decryptAESKey', {
        accountId,
        encryptedKey: Array.from(encryptedKeyBytes)
    });

    console.log('📨 Response from extension:', result);

    if (!result.success) {
        throw new Error("Extension decrypt failed");
    }

    const aesBytes = new Uint8Array(result.aesKey);

    console.log('🔑 AES bytes length:', aesBytes.length);

    return aesBytes; // ⚠️ IMPORTANT: RETURN BYTES ONLY
}
}

export default ExtensionService;