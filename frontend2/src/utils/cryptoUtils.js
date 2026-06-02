// Génère une clé AES-256-GCM aléatoire
export async function generateAESKey() {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable pour pouvoir l'exporter
    ['encrypt', 'decrypt']
  );
}

// Chiffre un buffer avec AES-GCM
export async function encryptWithAES(key, iv, data) {
  return await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );
}

// Exporte la clé AES en format raw (Uint8Array)
export async function exportAESKey(key) {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}