// controllers/SharesController.js
const pool = require('../config/db');

class SharesController {
  
  // Récupérer les fichiers/dossiers partagés par moi
  static async getSharedByMe(req, res) {
    console.log('📤 [getSharedByMe] Début');
    console.log('👤 User ID:', req.user?.userId);
    
    try {
      const userId = req.user.userId;
      
      const result = await pool.query(
        `SELECT 
          s.id, s.item_type, s.item_id, s.permission, s.created_at,
          u.email as shared_with_email,
          CASE 
            WHEN s.item_type = 'file' THEN f.filename
            WHEN s.item_type = 'folder' THEN fd.name
          END as name,
          CASE 
            WHEN s.item_type = 'file' THEN f.size
            WHEN s.item_type = 'folder' THEN NULL
          END as size
        FROM shares s
        JOIN users u ON s.shared_with_id = u.id
        LEFT JOIN files f ON s.item_type = 'file' AND s.item_id = f.id
        LEFT JOIN folders fd ON s.item_type = 'folder' AND s.item_id = fd.id
        WHERE s.owner_id = $1 AND s.status = 'active'
        ORDER BY s.created_at DESC`,
        [userId]
      );
      
      console.log(`✅ ${result.rows.length} éléments partagés trouvés`);
      
      res.json({
        success: true,
        data: result.rows
      });
      
    } catch (error) {
      console.error('❌ Erreur getSharedByMe:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Récupérer les fichiers/dossiers partagés avec moi
  static async getSharedWithMe(req, res) {
    console.log('📥 [getSharedWithMe] Début');
    console.log('👤 User ID:', req.user?.userId);
    
    try {
      const userId = req.user.userId;
      
      const result = await pool.query(
        `SELECT 
          s.id, s.item_type, s.item_id, s.permission, s.created_at,
          u.email as shared_by_email,
          CASE 
            WHEN s.item_type = 'file' THEN f.filename
            WHEN s.item_type = 'folder' THEN fd.name
          END as name,
          CASE 
            WHEN s.item_type = 'file' THEN f.size
            WHEN s.item_type = 'folder' THEN NULL
          END as size,
          f.encrypted_data IS NOT NULL as has_encrypted_data
        FROM shares s
        JOIN users u ON s.owner_id = u.id
        LEFT JOIN files f ON s.item_type = 'file' AND s.item_id = f.id
        LEFT JOIN folders fd ON s.item_type = 'folder' AND s.item_id = fd.id
        WHERE s.shared_with_id = $1 AND s.status = 'active'
        ORDER BY s.created_at DESC`,
        [userId]
      );
      
      console.log(`✅ ${result.rows.length} éléments partagés avec moi trouvés`);
      
      res.json({
        success: true,
        data: result.rows
      });
      
    } catch (error) {
      console.error('❌ Erreur getSharedWithMe:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Créer un partage
  static async createShare(req, res) {
    console.log('🔗 [createShare] Début');
    console.log('👤 User ID:', req.user?.userId);
    console.log('📝 Body:', req.body);
    
    try {
      const userId = req.user.userId;
      const { email, item_type, item_id, permission } = req.body;
      
      if (!email || !item_type || !item_id) {
        return res.status(400).json({
          success: false,
          message: "Email, type d'élément et ID sont requis"
        });
      }
      
      // Vérifier que l'utilisateur existe
      const userResult = await pool.query(
        `SELECT id FROM users WHERE email = $1`,
        [email]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur non trouvé"
        });
      }
      
      const sharedWithId = userResult.rows[0].id;
      
      // Vérifier que l'élément appartient à l'utilisateur
      let ownershipCheck;
      if (item_type === 'file') {
        ownershipCheck = await pool.query(
          `SELECT id FROM files WHERE id = $1 AND owner_id = $2`,
          [item_id, userId]
        );
      } else if (item_type === 'folder') {
        ownershipCheck = await pool.query(
          `SELECT id FROM folders WHERE id = $1 AND owner_id = $2`,
          [item_id, userId]
        );
      } else {
        return res.status(400).json({
          success: false,
          message: "Type d'élément invalide"
        });
      }
      
      if (ownershipCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Vous n'êtes pas propriétaire de cet élément"
        });
      }
      
      // Créer le partage
      const result = await pool.query(
        `INSERT INTO shares (owner_id, shared_with_id, item_type, item_id, permission)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, permission, created_at`,
        [userId, sharedWithId, item_type, item_id, permission || 'read']
      );
      
      console.log(`✅ Partage créé avec ID: ${result.rows[0].id}`);
      
      res.json({
        success: true,
        data: result.rows[0],
        message: "Partage créé avec succès"
      });
      
    } catch (error) {
      console.error('❌ Erreur createShare:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Révoquer un partage
  static async revokeShare(req, res) {
    console.log('🚫 [revokeShare] Début');
    console.log('📦 Share ID:', req.params.shareId);
    console.log('👤 User ID:', req.user?.userId);
    
    try {
      const { shareId } = req.params;
      const userId = req.user.userId;
      
      const result = await pool.query(
        `UPDATE shares 
         SET status = 'revoked', revoked_at = NOW()
         WHERE id = $1 AND owner_id = $2
         RETURNING id`,
        [shareId, userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Partage non trouvé"
        });
      }
      
      console.log(`✅ Partage ${shareId} révoqué`);
      
      res.json({
        success: true,
        message: "Partage révoqué avec succès"
      });
      
    } catch (error) {
      console.error('❌ Erreur revokeShare:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = SharesController;