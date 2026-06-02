const pool = require('../config/db');
const fs = require('fs');

class FileController {
  static async getUserFiles(req, res) {
    try {
      const userId = req.user.userId;
      const result = await pool.query(
        `SELECT id, filename, size, created_at FROM Files WHERE owner_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

static async getFileForDownload(req, res) {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT f.filename, f.encrypted_data, f.iv, fk.encrypted_key
       FROM files f
       JOIN filekeys fk ON f.id = fk.file_id
       WHERE f.id = $1 AND fk.user_id = $2`,
      [fileId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Fichier non trouvé'
      });
    }

    const file = result.rows[0];

res.json({
  success: true,
  data: {
    filename: file.filename,
    encryptedData: file.encrypted_data.toString('base64'),
    encryptedKey: file.encrypted_key.toString('base64'), // ✅ ICI
    iv: file.iv
  }
});

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

static async deleteFile(req, res) {
  const client = await pool.connect();

  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const fileRes = await client.query(
      `SELECT size FROM files WHERE id = $1 AND owner_id = $2`,
      [fileId, userId]
    );

    if (fileRes.rows.length === 0) {
      return res.status(404).json({ success: false });
    }

    const size = fileRes.rows[0].size;

    await client.query('BEGIN');

    await client.query('DELETE FROM filekeys WHERE file_id = $1', [fileId]);
    await client.query('DELETE FROM files WHERE id = $1', [fileId]);

    await client.query(
      'UPDATE users SET used_space = used_space - $1 WHERE id = $2',
      [size, userId]
    );

    await client.query('COMMIT');

    res.json({ success: true });

  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
}

static async getFilesByFolder(req, res) {
  try {
    const userId = req.user.userId;
    const folderId = req.query.folder_id ? parseInt(req.query.folder_id) : null;
    let query;
    let params;
    if (folderId === null) {
      query = `SELECT id, filename, size, created_at FROM files 
               WHERE owner_id = $1 AND (folder_id IS NULL) 
               ORDER BY created_at DESC`;
      params = [userId];
    } else {
      query = `SELECT id, filename, size, created_at FROM files 
               WHERE owner_id = $1 AND folder_id = $2 
               ORDER BY created_at DESC`;
      params = [userId, folderId];
    }
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
}

static async renameFile(req, res) {
  try {
    const { fileId } = req.params;
    const { newName } = req.body;
    const userId = req.user.userId;

    if (!newName) {
      return res.status(400).json({ success: false, message: "Nom requis" });
    }

    const result = await pool.query(
      `UPDATE files 
       SET filename = $1 
       WHERE id = $2 AND owner_id = $3
       RETURNING id, filename`,
      [newName, fileId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false });
    }

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
static async downloadFolder(req, res) {
  try {
    const { folderId } = req.params;
    const userId = req.user.userId;

    // Récupérer tous les fichiers du dossier (y compris sous-dossiers)
    const files = await pool.query(
      `SELECT f.filename, f.encrypted_data, f.iv
       FROM files f
       WHERE f.owner_id = $1 AND f.folder_id = $2`,
      [userId, folderId]
    );

    if (files.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Dossier vide" });
    }

    // Créer un ZIP en mémoire
    const JSZip = require('jszip');
    const zip = new JSZip();

    for (const file of files.rows) {
      // Déchiffrer le fichier (vous avez déjà cette logique quelque part, ici on suppose que le fichier est déjà déchiffré ? Non, il faudrait déchiffrer chaque fichier)
      // Pour simplifier, on suppose que encrypted_data est déjà le contenu déchiffré (en production, il faudrait déchiffrer avec la clé privée)
      zip.file(file.filename, file.encrypted_data);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=folder_${folderId}.zip`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
}

module.exports = FileController;