
const pool = require('../config/db');

class QuotaService {
  
  // Vérifie si l'utilisateur a assez d'espace pour ajouter un fichier de taille fileSize
  static async checkQuota(userId, fileSize) {
    console.log(`🔍 [QUOTA] checkQuota - userId: ${userId}, fileSize: ${fileSize} bytes`);
    
    try {
      const result = await pool.query(
        'SELECT quota, used_space FROM Users WHERE id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        console.error(`❌ [QUOTA] Utilisateur ${userId} non trouvé`);
        throw new Error('Utilisateur non trouvé');
      }

      const { quota, used_space } = result.rows[0];
      const quotaNum = parseInt(quota);
      const usedNum = parseInt(used_space);
      const newUsed = usedNum + fileSize;
      const available = quotaNum - usedNum;
      
      console.log(`📊 [QUOTA] Stats:`);
      console.log(`   - Quota total: ${quotaNum} bytes (${(quotaNum / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
      console.log(`   - Espace utilisé: ${usedNum} bytes (${(usedNum / (1024 * 1024)).toFixed(2)} MB)`);
      console.log(`   - Espace disponible: ${available} bytes (${(available / (1024 * 1024)).toFixed(2)} MB)`);
      console.log(`   - Nouvelle taille: ${newUsed} bytes (${(newUsed / (1024 * 1024)).toFixed(2)} MB)`);
      
      if (newUsed > quotaNum) {
        console.error(`❌ [QUOTA] Quota insuffisant! Besoin: ${newUsed}, Max: ${quotaNum}`);
        throw new Error(`Quota insuffisant. Espace disponible : ${available} bytes`);
      }
      
      console.log(`✅ [QUOTA] Quota suffisant`);
      return { available, newUsed };
      
    } catch (error) {
      console.error(`❌ [QUOTA] Erreur:`, error.message);
      throw error;
    }
  }

  // Met à jour l'espace utilisé (ajout ou suppression)
  static async updateQuota(userId, fileSize, operation = 'add') {
    const delta = operation === 'add' ? fileSize : -fileSize;
    console.log(`🔄 [QUOTA] updateQuota - userId: ${userId}, delta: ${delta} (${operation})`);
    
    try {
      const result = await pool.query(
        'UPDATE Users SET used_space = used_space + $1 WHERE id = $2 RETURNING used_space, quota',
        [delta, userId]
      );
      
      if (result.rows.length === 0) {
        console.error(`❌ [QUOTA] Utilisateur ${userId} non trouvé pour mise à jour`);
        throw new Error('Utilisateur non trouvé');
      }
      
      const { used_space, quota } = result.rows[0];
      console.log(`✅ [QUOTA] Nouvel espace utilisé: ${used_space} / ${quota} bytes`);
      
      return result.rows[0];
      
    } catch (error) {
      console.error(`❌ [QUOTA] Erreur updateQuota:`, error.message);
      throw error;
    }
  }

  // Récupère les informations de quota
  static async getQuotaInfo(userId) {
    console.log(`🔍 [QUOTA] getQuotaInfo - userId: ${userId}`);
    
    try {
      const result = await pool.query(
        'SELECT quota, used_space FROM Users WHERE id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        console.error(`❌ [QUOTA] Utilisateur ${userId} non trouvé`);
        return null;
      }
      
      const { quota, used_space } = result.rows[0];
      const quotaNum = parseInt(quota);
      const usedNum = parseInt(used_space);
      const available = quotaNum - usedNum;
      const usagePercent = (usedNum / quotaNum) * 100;
      
      console.log(`📊 [QUOTA] Infos: total=${quotaNum}, used=${usedNum}, available=${available}, usage=${usagePercent.toFixed(2)}%`);
      
      return {
        total: quotaNum,
        used: usedNum,
        available: available,
        usagePercent: usagePercent
      };
      
    } catch (error) {
      console.error(`❌ [QUOTA] Erreur getQuotaInfo:`, error.message);
      throw error;
    }
  }
  
  // Vérifie et met à jour le quota en une seule opération (pour transactions)
  static async checkAndUpdateQuota(client, userId, fileSize) {
    console.log(`🔍 [QUOTA] checkAndUpdateQuota - userId: ${userId}, fileSize: ${fileSize}`);
    
    const result = await client.query(
      'SELECT quota, used_space FROM Users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Utilisateur non trouvé');
    }
    
    const { quota, used_space } = result.rows[0];
    const quotaNum = parseInt(quota);
    const usedNum = parseInt(used_space);
    const newUsed = usedNum + fileSize;
    
    if (newUsed > quotaNum) {
      throw new Error(`Quota insuffisant. Espace disponible : ${quotaNum - usedNum} bytes`);
    }
    
    await client.query(
      'UPDATE Users SET used_space = $1 WHERE id = $2',
      [newUsed, userId]
    );
    
    console.log(`✅ [QUOTA] Quota mis à jour: ${usedNum} -> ${newUsed} bytes`);
    
    return newUsed;
  }
}

module.exports = QuotaService;