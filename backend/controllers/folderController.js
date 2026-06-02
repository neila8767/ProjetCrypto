const pool = require('../config/db');

class FoldersController {
  
  // Récupérer les sous-dossiers d'un dossier parent (ou racine)
  static async getUserFolders(req, res) {
    console.log('📁 [getUserFolders] Début');
    console.log('👤 User ID:', req.user?.userId);
    const parentId = req.query.parent_id ? parseInt(req.query.parent_id) : null;
    
    try {
      const userId = req.user.userId;
      let query, params;
      if (parentId === null) {
        query = `SELECT id, name, created_at FROM folders 
                 WHERE owner_id = $1 AND parent_id IS NULL 
                 ORDER BY created_at DESC`;
        params = [userId];
      } else {
        query = `SELECT id, name, created_at FROM folders 
                 WHERE owner_id = $1 AND parent_id = $2 
                 ORDER BY created_at DESC`;
        params = [userId, parentId];
      }
      const result = await pool.query(query, params);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('❌ Erreur getUserFolders:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
  
  // Créer un nouveau dossier
  static async createFolder(req, res) {
    console.log('📁 [createFolder] Début');
    console.log('👤 User ID:', req.user?.userId);
    console.log('📝 Body:', req.body);
    
    try {
      const userId = req.user.userId;
      const { name, parent_id } = req.body;
      
      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Le nom du dossier est requis"
        });
      }
      
      const result = await pool.query(
        `INSERT INTO folders (owner_id, name, parent_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, parent_id, created_at`,
        [userId, name, parent_id || null]
      );
      
      console.log(`✅ Dossier créé avec ID: ${result.rows[0].id}`);
      
      res.json({
        success: true,
        data: result.rows[0],
        message: "Dossier créé avec succès"
      });
      
    } catch (error) {
      console.error('❌ Erreur createFolder:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // Supprimer un dossier
  static async deleteFolder(req, res) {
    console.log('🗑️ [deleteFolder] Début');
    console.log('📦 Folder ID:', req.params.folderId);
    console.log('👤 User ID:', req.user?.userId);
    
    const client = await pool.connect();
    
    try {
      const { folderId } = req.params;
      const userId = req.user.userId;
      
      await client.query('BEGIN');
      
      const folderCheck = await client.query(
        `SELECT id FROM folders WHERE id = $1 AND owner_id = $2`,
        [folderId, userId]
      );
      
      if (folderCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: "Dossier non trouvé"
        });
      }
      
      await client.query(`UPDATE files SET folder_id = NULL WHERE folder_id = $1`, [folderId]);
      await client.query(`DELETE FROM folders WHERE id = $1 AND owner_id = $2`, [folderId, userId]);
      
      await client.query('COMMIT');
      
      console.log(`✅ Dossier ${folderId} supprimé`);
      
      res.json({
        success: true,
        message: "Dossier supprimé avec succès"
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erreur deleteFolder:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    } finally {
      client.release();
    }
  }
  static async renameFolder(req, res) {
  try {
    const { folderId } = req.params;
    const { newName } = req.body;
    const userId = req.user.userId;

    const result = await pool.query(
      `UPDATE folders 
       SET name = $1 
       WHERE id = $2 AND owner_id = $3
       RETURNING id, name`,
      [newName, folderId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false });
    }

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    res.status(500).json({ success: false });
  }
}
}

module.exports = FoldersController;