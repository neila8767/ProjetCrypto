import { generateAESKey, encryptWithAES, exportAESKey } from '../utils/cryptoUtils';
import ExtensionService from './extensionService';

class UploadService {

  static async prepareFileUpload(file) {

    console.log("🔐 Préparation upload");

    // =========================
    // 1. AES KEY
    // =========================
    const aesKey = await generateAESKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const fileBuffer = await file.arrayBuffer();

    const encryptedFile = await encryptWithAES(aesKey, iv, fileBuffer);

    const aesKeyRaw = await exportAESKey(aesKey);

    // =========================
    // 2. HASH
    // =========================
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    const fileHash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

    // =========================
    // 3. RSA via extension
    // =========================
    const encryptedAesKey = await ExtensionService.encryptAESKey(
      aesKeyRaw,
      'personal'
    );

    // =========================
    // 4. RETURN FINAL
    // =========================
    return {
      encryptedFile: new Uint8Array(encryptedFile),
      encryptedAesKey,
      iv,
      fileHash,
      filename: file.name,
      size: file.size,
      accountId: 'personal'
    };
  }

  // =========================
  // UPLOAD BACKEND
  // =========================
 static async uploadPrepared(preparedData, folderId = null) {
  console.log('📤 [UploadService] Envoi au backend...');
console.log('   - folderId reçu :', folderId);
  const formData = new FormData();

  // ✅ 1. fichier chiffré (BLOB)
  formData.append(
    'file',
    new Blob([preparedData.encryptedFile]),
    preparedData.filename
  );

  // ✅ 2. nom fichier
  formData.append('filename', preparedData.filename);

  // ✅ 3. clé AES chiffrée (RSA)
  formData.append(
    'encryptedFileKey',
    btoa(String.fromCharCode(...preparedData.encryptedAesKey))
  );

  // ✅ 4. IV (très important)
  formData.append(
    'iv',
    btoa(String.fromCharCode(...preparedData.iv))
  );

  // ✅ 5. hash fichier
  formData.append('fileHash', preparedData.fileHash);

  formData.append('folderId', folderId !== null ? folderId : '');
  formData.append('accountId', preparedData.accountId);

  const response = await fetch('http://localhost:3000/api/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
    },
    body: formData
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || "Upload échoué");
  }

  console.log('✅ Upload réussi');

  return data;
}
}

export default UploadService;