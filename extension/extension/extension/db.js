// db.js - Version corrigée
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('walletDB', 1);

    request.onerror = (event) => {
      console.error('Database error:', event.target.error);
      reject(event.target.error);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('Initializing database - creating object stores');
      
      if (!db.objectStoreNames.contains('wallet')) {
        db.createObjectStore('wallet');
        console.log('Object store "wallet" created successfully');
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      console.log('Database opened successfully');
      resolve(db);
    };
  });
}

function saveWallet(walletData) {
  return new Promise(async (resolve, reject) => {
    let db = null;
    try {
      db = await openDB();
      
      if (!db.objectStoreNames.contains('wallet')) {
        reject(new Error('Object store "wallet" does not exist'));
        return;
      }
      
      const transaction = db.transaction(['wallet'], 'readwrite');
      const store = transaction.objectStore('wallet');
      
      // S'assurer que publicKey est bien une chaîne
      const publicKeyToStore = typeof walletData.publicKey === 'string' 
        ? walletData.publicKey 
        : JSON.stringify(walletData.publicKey);
      
      console.log('Saving public key (type:', typeof publicKeyToStore, 'length:', publicKeyToStore.length);
      
      store.put(walletData.encryptedPrivateKey, 'encryptedPrivateKey');
      store.put(publicKeyToStore, 'publicKey');
      store.put(walletData.salt, 'salt');
      store.put(walletData.iv, 'iv');
      
      transaction.oncomplete = () => {
        console.log('Wallet saved successfully');
        resolve();
        db.close();
      };
      
      transaction.onerror = (event) => {
        console.error('Transaction error:', event.target.error);
        reject(event.target.error);
        db.close();
      };
      
    } catch (error) {
      console.error('Error in saveWallet:', error);
      if (db) db.close();
      reject(error);
    }
  });
}

function getWallet() {
  return new Promise(async (resolve, reject) => {
    let db = null;
    try {
      db = await openDB();
      
      if (!db.objectStoreNames.contains('wallet')) {
        resolve(null);
        db.close();
        return;
      }
      
      const transaction = db.transaction(['wallet'], 'readonly');
      const store = transaction.objectStore('wallet');
      
      const [encryptedPrivateKey, publicKey, salt, iv] = await Promise.all([
        store.get('encryptedPrivateKey'),
        store.get('publicKey'),
        store.get('salt'),
        store.get('iv')
      ]);
      
      // S'assurer que publicKey est une chaîne
      const publicKeyString = typeof publicKey === 'string' ? publicKey : JSON.stringify(publicKey);
      
      if (!encryptedPrivateKey && !publicKeyString && !salt && !iv) {
        resolve(null);
      } else {
        resolve({ 
          encryptedPrivateKey, 
          publicKey: publicKeyString, 
          salt, 
          iv 
        });
      }
      
      db.close();
      
    } catch (error) {
      console.error('Error in getWallet:', error);
      if (db) db.close();
      reject(error);
    }
  });
}