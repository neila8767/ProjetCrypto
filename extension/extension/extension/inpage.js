// inpage.js - Version compatible avec background.js
console.log('🔵 [INPAGE] Script inpage chargé - timestamp:', new Date().toISOString());
console.log('🔵 [INPAGE] URL:', window.location.href);
console.log('🔵 [INPAGE] User Agent:', navigator.userAgent);

// Stockage des promesses en attente
const pendingRequests = new Map();

// Créer l'API wallet
console.log('🟢 [INPAGE] Création de window.myWallet');

window.myWallet = {
  // Méthode générique send pour toutes les actions
  send: (action, payload) => {
    console.log(`📤 [INPAGE] send() appelé - action: ${action}`);
    console.log(`📦 [INPAGE] payload:`, payload);
    
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substring(2) + Date.now();
      console.log(`🆔 [INPAGE] Généré requestId: ${requestId}`);
      
      // Timeout après 5 minutes (300 secondes) pour laisser le temps à l'utilisateur
      const timeout = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          console.warn(`⚠️ [INPAGE] Timeout pour requestId: ${requestId}`);
          pendingRequests.delete(requestId);
          reject(new Error('Request timeout - Veuillez vérifier l\'extension SecureCloud'));
        }
      }, 300000); // 5 minutes
      
      // Stocker la promesse avec gestion du timeout
      pendingRequests.set(requestId, { 
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        }, 
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      
      console.log(`🟢 [INPAGE] Promesse stockée pour ${requestId}, total: ${pendingRequests.size}`);
      
      try {
        const message = { action: 'wallet:' + action, payload, requestId };
        console.log(`📤 [INPAGE] Envoi du message:`, message);
        window.postMessage(message, '*');
        console.log(`✅ [INPAGE] Message posté avec succès`);
      } catch (error) {
        console.error(`❌ [INPAGE] Erreur postMessage:`, error);
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
        reject(error);
      }
    });
  },
  
  // ==================== MÉTHODES EXISTANTES ====================
  
  // Récupérer TOUS les comptes
  getAllAccounts: async () => {
    console.log('🔵 [INPAGE] getAllAccounts appelé');
    try {
      const result = await window.myWallet.send('getAllAccounts', {});
      console.log('✅ [INPAGE] getAllAccounts résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] getAllAccounts erreur:', error);
      throw error;
    }
  },
  
  // Récupérer les comptes (alias)
  getAccounts: async () => {
    console.log('🔵 [INPAGE] getAccounts appelé');
    try {
      const result = await window.myWallet.send('getAllAccounts', {});
      console.log('✅ [INPAGE] getAccounts résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] getAccounts erreur:', error);
      throw error;
    }
  },
  
  // Vérifier si wallet déverrouillé
  isUnlocked: async () => {
    console.log('🔵 [INPAGE] isUnlocked appelé');
    try {
      const result = await window.myWallet.send('isUnlocked', {});
      console.log('✅ [INPAGE] isUnlocked résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] isUnlocked erreur:', error);
      throw error;
    }
  },
  
  // Obtenir le compte actif
  getActiveAccount: async () => {
    console.log('🔵 [INPAGE] getActiveAccount appelé');
    try {
      const result = await window.myWallet.send('getActiveAccount', {});
      console.log('✅ [INPAGE] getActiveAccount résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] getActiveAccount erreur:', error);
      throw error;
    }
  },
  
  // Changer de compte
  switchAccount: async (accountId) => {
    console.log('🔵 [INPAGE] switchAccount appelé:', accountId);
    try {
      const result = await window.myWallet.send('switchAccount', { accountId });
      console.log('✅ [INPAGE] switchAccount résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] switchAccount erreur:', error);
      throw error;
    }
  },
  
  // Obtenir les détails d'un compte
  getAccountDetails: async (accountId, password) => {
    console.log('🔵 [INPAGE] getAccountDetails appelé:', accountId);
    try {
      const result = await window.myWallet.send('getAccountDetails', { accountId, password });
      console.log('✅ [INPAGE] getAccountDetails résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] getAccountDetails erreur:', error);
      throw error;
    }
  },
  
  // ==================== MÉTHODES POUR CSR ====================
  
  /**
   * Inscription - Génère des CSR pour tous les comptes
   * @param {Object} params - Paramètres
   * @param {string} params.email - Email de l'utilisateur
   * @param {string} params.password - Mot de passe (optionnel si déjà déverrouillé)
   * @returns {Promise<{success: boolean, csrs: Array, count: number}>}
   */
  signRegistration: async ({ email, password }) => {
    console.log('🔵 [INPAGE] signRegistration appelé');
    console.log('📝 [INPAGE] email:', email);
    console.log('🔑 [INPAGE] password fourni:', !!password);
    
    try {
      const result = await window.myWallet.send('signRegistration', { email, password });
      console.log('✅ [INPAGE] signRegistration résultat:', result);
      console.log(`📊 [INPAGE] ${result.count} CSR(s) générés`);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] signRegistration erreur:', error);
      throw error;
    }
  },
  
  // ==================== MÉTHODES POUR SIGNATURE ====================
  
  /**
   * Signe un challenge avec la clé privée du compte
   * @param {Object} params - Paramètres
   * @param {string} params.accountId - ID du compte à utiliser
   * @param {string} params.challenge - Challenge à signer
   * @param {string} params.nonce - Nonce pour éviter les replay attacks
   * @param {number} params.timestamp - Timestamp du challenge
   * @param {string} params.site - Site qui demande la signature (pour sécurité)
   * @returns {Promise<{signature: string, accountId: string, publicKey: Object}>}
   */
  signChallenge: async ({ accountId, challenge, nonce, timestamp, site }) => {
    console.log('🔵 [INPAGE] signChallenge appelé');
    console.log('📝 [INPAGE] accountId reçu:', accountId);
    console.log('📝 [INPAGE] challenge (début):', challenge?.substring(0, 50) + '...');
    console.log('🔢 [INPAGE] nonce:', nonce);
    console.log('⏰ [INPAGE] timestamp:', timestamp);
    console.log('🌐 [INPAGE] site:', site || window.location.origin);
    
    try {
      const result = await window.myWallet.send('signChallenge', {
        accountId,
        challenge,
        nonce,
        timestamp,
        site: site || window.location.origin
      });
      
      console.log('✅ [INPAGE] signChallenge résultat reçu:');
      console.log('   - signature (début):', result?.signature?.substring(0, 50) + '...');
      console.log('   - accountId retourné:', result?.accountId);
      console.log('   - publicKey (n):', result?.publicKey?.n?.substring(0, 30) + '...');
      
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] signChallenge erreur:', error);
      throw error;
    }
  },
  
  /**
   * Déverrouille le wallet avec un mot de passe
   * @param {string} password - Mot de passe local
   * @returns {Promise<Object>} - Résultat du déverrouillage
   */
  unlockWallet: async (password) => {
    console.log('🔵 [INPAGE] unlockWallet appelé');
    try {
      const result = await window.myWallet.send('unlockWallet', { password });
      console.log('✅ [INPAGE] unlockWallet résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] unlockWallet erreur:', error);
      throw error;
    }
  },
  
  /**
   * Ouvre la popup de l'extension
   * @returns {Promise<Object>}
   */
  openPopup: async () => {
    console.log('🔵 [INPAGE] openPopup appelé');
    try {
      const result = await window.myWallet.send('openPopup', {});
      console.log('✅ [INPAGE] openPopup résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] openPopup erreur:', error);
      throw error;
    }
  },
  
  /**
   * Récupère toutes les clés publiques
   * @returns {Promise<Object>} - Liste des comptes avec clés publiques
   */
  getAllPublicKeys: async () => {
    console.log('🔵 [INPAGE] getAllPublicKeys appelé');
    try {
      const result = await window.myWallet.send('getAllPublicKeys', {});
      console.log('✅ [INPAGE] getAllPublicKeys résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] getAllPublicKeys erreur:', error);
      throw error;
    }
  },
  
  /**
   * Vérifie s'il y a des demandes en attente
   * @returns {Promise<Object>}
   */
  getPendingRequests: async () => {
    console.log('🔵 [INPAGE] getPendingRequests appelé');
    try {
      const result = await window.myWallet.send('getPendingRequests', {});
      console.log('✅ [INPAGE] getPendingRequests résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] getPendingRequests erreur:', error);
      throw error;
    }
  },
  
  /**
   * Récupère les demandes d'inscription en attente
   * @returns {Promise<Object>}
   */
  getPendingRegistrations: async () => {
    console.log('🔵 [INPAGE] getPendingRegistrations appelé');
    try {
      const result = await window.myWallet.send('getPendingRegistrations', {});
      console.log('✅ [INPAGE] getPendingRegistrations résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] getPendingRegistrations erreur:', error);
      throw error;
    }
  },
  
  /**
   * Annule une demande en attente
   * @param {string} requestId - ID de la demande
   * @returns {Promise<Object>}
   */
  cancelPendingRequest: async (requestId) => {
    console.log('🔵 [INPAGE] cancelPendingRequest appelé:', requestId);
    try {
      const result = await window.myWallet.send('cancelPendingRequest', { requestId });
      console.log('✅ [INPAGE] cancelPendingRequest résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] cancelPendingRequest erreur:', error);
      throw error;
    }
  },
  
  /**
   * Annule une demande d'inscription en attente
   * @param {string} requestId - ID de la demande
   * @returns {Promise<Object>}
   */
  cancelPendingRegistration: async (requestId) => {
    console.log('🔵 [INPAGE] cancelPendingRegistration appelé:', requestId);
    try {
      const result = await window.myWallet.send('cancelPendingRegistration', { requestId });
      console.log('✅ [INPAGE] cancelPendingRegistration résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] cancelPendingRegistration erreur:', error);
      throw error;
    }
  },
  
  // ==================== MÉTHODES POUR CHIFFREMENT ====================
  
  /**
   * Chiffre un fichier avec la clé publique du compte actif
   * @param {File|ArrayBuffer} file - Fichier à chiffrer
   * @param {string} publicKey - Clé publique au format JWK
   * @returns {Promise<Object>}
   */
  encryptFile: async (file, publicKey) => {
    console.log('🔵 [INPAGE] encryptFile appelé');
    try {
      let fileBuffer;
      if (file instanceof File) {
        fileBuffer = await file.arrayBuffer();
      } else if (file instanceof ArrayBuffer) {
        fileBuffer = file;
      } else {
        throw new Error('Format de fichier non supporté');
      }
      
      const result = await window.myWallet.send('encrypt', { file: Array.from(new Uint8Array(fileBuffer)), publicKey });
      console.log('✅ [INPAGE] encryptFile résultat:', result);
      return result;
    } catch (error) {
      console.error('❌ [INPAGE] encryptFile erreur:', error);
      throw error;
    }
  },
  
  /**
   * Déchiffre un fichier avec la clé privée du compte approprié
   * @param {Object} encryptedData - Données chiffrées
   * @returns {Promise<Uint8Array>}
   */
  decryptFile: async (encryptedData) => {
    console.log('🔵 [INPAGE] decryptFile appelé');
    try {
      const result = await window.myWallet.send('decrypt', { encryptedData });
      console.log('✅ [INPAGE] decryptFile résultat:', result);
      return new Uint8Array(result);
    } catch (error) {
      console.error('❌ [INPAGE] decryptFile erreur:', error);
      throw error;
    }
  },
  
  // ==================== MÉTHODE UTILITAIRE ====================
  
  /**
   * Vérifie si l'extension est disponible
   * @returns {Promise<boolean>}
   */
  ping: async () => {
    console.log('🔵 [INPAGE] ping appelé');
    try {
      const result = await window.myWallet.send('isUnlocked', {});
      return true;
    } catch (error) {
      console.error('❌ [INPAGE] ping erreur:', error);
      return false;
    }
  }
};

// ✅ Écouter les réponses du content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  const { type, requestId, result, error } = event.data;
  
  // Vérifier si c'est une réponse
  if (type === 'SECURECLOUD_RESPONSE' && requestId) {
    console.log(`📨 [INPAGE] Réponse reçue pour requestId: ${requestId}`);
    console.log(`📦 [INPAGE] Résultat brut:`, result);
    
    const pending = pendingRequests.get(requestId);
    if (pending) {
      console.log(`✅ [INPAGE] Match trouvé pour requestId: ${requestId}`);
      
      if (error) {
        console.error(`❌ [INPAGE] Erreur:`, error);
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
      pendingRequests.delete(requestId);
      console.log(`📊 [INPAGE] Promesses restantes: ${pendingRequests.size}`);
    } else {
      console.warn(`⚠️ [INPAGE] Aucune promesse trouvée pour requestId: ${requestId}`);
    }
  }
});

// Vérifier que l'API est bien créée
console.log('✅ [INPAGE] window.myWallet créé avec méthodes:', Object.keys(window.myWallet));

// Notifier que l'API est prête
window.dispatchEvent(new CustomEvent('securecloud:ready'));
console.log('🎉 [INPAGE] Événement securecloud:ready dispatché');

// Notifier via postMessage aussi
window.postMessage({ type: 'securecloud:api:ready' }, '*');
console.log('🎉 [INPAGE] Message securecloud:api:ready envoyé');

// Ajouter un indicateur visible dans la console
console.log('%c🔐 SecureCloud Extension API Ready', 'color: #00ff00; font-size: 14px; font-weight: bold;');
console.log('📋 Méthodes disponibles:');
Object.keys(window.myWallet).forEach(method => {
  console.log(`   - ${method}`);
});

console.log('✅ [INPAGE] Script inpage chargé avec succès');
console.log('🔑 [INPAGE] window.myWallet disponible:', !!window.myWallet);
console.log('🔐 [INPAGE] Méthodes disponibles:', Object.keys(window.myWallet).join(', '));