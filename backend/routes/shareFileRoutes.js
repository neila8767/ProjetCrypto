// routes/shareRoutes.js - Créez ce NOUVEAU fichier
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/authMiddleware');
const ShareController = require('../controllers/shareFileController');

// ==================== ROUTES DE PARTAGE ====================

// 1. Partager un fichier
router.post('/sharefile', authenticateToken, ShareController.shareFile);

// 2. Accepter un partage (token dans l'URL)
router.get('/share/accept/:token', authenticateToken, ShareController.acceptShare);
// Routes pour les partages
router.get('/shared-with-me', authenticateToken, ShareController.getSharedWithMe);
router.get('/shared-by-me', authenticateToken, ShareController.getPeopleISharedWith);
router.get('/shared-by-me-simple', authenticateToken, ShareController.getSharedByMeSimple);

// 3. Redirection pour les emails (public - sans auth)
router.get('/share/redirect', async (req, res) => {
    console.log('\n🔗 [SHARE_REDIRECT] ====== REDIRECTION PARTAGE ======');
    console.log('📥 Query params:', req.query);
    
    const { token, ownerKeyId, recipientKeyId, fileId } = req.query;
    
    const frontendUrl = `http://localhost:5173/share/accept?token=${token}&ownerKeyId=${ownerKeyId}&recipientKeyId=${recipientKeyId}&fileId=${fileId}`;
    
    console.log('🔀 Redirection vers:', frontendUrl);
    res.redirect(frontendUrl);
});

// 4. Récupérer la clé chiffrée d'un fichier
router.get('/files/:fileId/encrypted-key', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    console.log(`🔑 Récupération clé - File: ${fileId}, User: ${userId}`);

    // Récupérer la clé (active d'abord, sinon la dernière)
    const result = await pool.query(
      `SELECT encrypted_key, key_type, active 
       FROM filekeys 
       WHERE file_id = $1 AND user_id = $2 
       LIMIT 1`,
      [fileId, userId]
    );

    if (result.rows.length === 0) {
      console.log(`❌ Clé non trouvée`);
      return res.status(404).json({
        success: false,
        message: "Clé de chiffrement non trouvée pour ce fichier"
      });
    }

    const keyData = result.rows[0];
    console.log(`✅ Clé trouvée - Type: ${keyData.key_type}, Active: ${keyData.active}`);
    
    res.json({
      success: true,
      encryptedKey: keyData.encrypted_key,
      keyType: keyData.key_type,
      active: keyData.active
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;