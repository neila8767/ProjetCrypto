import ExtensionService from './extensionService';

class DownloadService {

  // ✅ méthode statique correcte
  static normalizeAESKey(bytes) {
    console.log('🔧 [normalizeAESKey] Input length:', bytes.length);

    const key = new Uint8Array(32);
    key.set(bytes.slice(0, 32));

    console.log('🔧 [normalizeAESKey] Output length:', key.length);
    console.log('🔧 [normalizeAESKey] Preview:', Array.from(key.slice(0, 10)));

    return key;
  }

  static base64ToUint8Array(base64) {
    console.log('📦 Converting base64 → Uint8Array');

    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    console.log('📦 Converted length:', bytes.length);
    return bytes;
  }

  static async downloadFile(fileId, accountId) {
  console.log('🚀 Download start:', fileId);

  const response = await fetch(
    `http://localhost:3000/api/files/${fileId}/download`,
    {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("accessToken")}`
      }
    }
  );

  const json = await response.json();

  const { filename, encryptedData, encryptedKey, iv } = json.data;

  console.log('📄 File:', filename);

  // =========================
  // 1. Decode
  // =========================
  const encryptedBuffer = this.base64ToUint8Array(encryptedData);
  const ivBytes = this.base64ToUint8Array(iv);

  // =========================
  // 2. AES KEY FROM EXTENSION
  // =========================
  console.log('🔑 Getting AES key...');

  const aesBytes = await ExtensionService.decryptAESKey(
    encryptedKey,
    accountId
  );

  console.log('🔑 AES raw length:', aesBytes.length);

  // =========================
  // 3. FIX KEY SIZE (IMPORTANT)
  // =========================
  const fixedKey = this.normalizeAESKey(aesBytes);

  // =========================
  // 4. IMPORT KEY
  // =========================
  console.log('🔐 Importing key...');

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    fixedKey,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  console.log('✅ CryptoKey ready');

  // =========================
  // 5. DECRYPT FILE
  // =========================
  console.log('🔓 Decrypting file...');

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBytes
    },
    cryptoKey,
    encryptedBuffer
  );

  console.log('✅ File decrypted');

  return { decryptedBuffer, filename };
}
static async downloadAndSave(fileId, accountId) {
  console.log('⬇️ Download + Save start');

  // 1. Télécharger + déchiffrer
  const { decryptedBuffer, filename } = await this.downloadFile(
    fileId,
    accountId
  );

  console.log('📦 Creating blob...');

  // 2. Créer un blob
  const blob = new Blob([decryptedBuffer]);

  // 3. Créer URL
  const url = window.URL.createObjectURL(blob);

  // 4. Créer lien invisible
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  // 5. Cleanup
  a.remove();
  window.URL.revokeObjectURL(url);

  console.log('✅ File downloaded');
}
}

export default DownloadService;