const pool = require('../config/db');
const QuotaService = require('../services/quotaService');

class UploadController {

  static async uploadFile(req, res) {
    const client = await pool.connect();

    try {
      const userId = req.user.userId;

      // 🔴 récup données envoyées par frontend
      const fileBuffer = req.file.buffer;
      const { filename, encryptedFileKey, iv, fileHash, folderId } = req.body;
 console.log('📥 Backend reçu folderId:', folderId);
      let folder_id = folderId && folderId !== 'null' ? parseInt(folderId) : null;
console.log('   - folder_id après conversion:', folder_id);
      if (!fileBuffer || !encryptedFileKey || !iv) {
        return res.status(400).json({
          success: false,
          message: "Données manquantes"
        });
      }

      const fileSize = fileBuffer.length;

      // ✅ Vérifier quota
      await QuotaService.checkQuota(userId, fileSize);

      await client.query('BEGIN');

      // =========================
      // 1. INSERT FILE
      // =========================
const fileResult = await client.query(
  `INSERT INTO files 
   (owner_id, filename, size, encrypted_data, iv, file_hash, folder_id)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   RETURNING id`,
  [userId, filename, fileSize, fileBuffer, iv, fileHash, folder_id]
);

      const fileId = fileResult.rows[0].id;

      // =========================
      // 2. INSERT FILE KEY
      // =========================
      await client.query(
        `INSERT INTO filekeys (file_id, user_id, encrypted_key)
         VALUES ($1, $2, $3)`,
        [
          fileId,
          userId,
          encryptedFileKey
        ]
      );

      // =========================
      // 3. UPDATE QUOTA
      // =========================
      await client.query(
        `UPDATE users SET used_space = used_space + $1 WHERE id = $2`,
        [fileSize, userId]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        fileId
      });

    } catch (error) {
      await client.query('ROLLBACK');

      console.error("UPLOAD ERROR:", error);

      res.status(500).json({
        success: false,
        message: error.message
      });
    } finally {
      client.release();
    }
  }
}

module.exports = UploadController;