const pool = require('../config/db');
const bcrypt = require('bcrypt');

class User {
  // Créer un utilisateur
  static async create(email, password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO Users (email, password_hash) VALUES ($1, $2) RETURNING id, email, is_active',
      [email, hashedPassword]
    );
    return result.rows[0];
  }

  // Trouver par email
  static async findByEmail(email) {
    const result = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
    return result.rows[0];
  }

  // Trouver par ID
  static async findById(id) {
    const result = await pool.query('SELECT id, email, is_active, quota, used_space FROM Users WHERE id = $1', [id]);
    return result.rows[0];
  }

  // Activer compte
  static async activate(userId) {
    await pool.query('UPDATE Users SET is_active = true WHERE id = $1', [userId]);
  }

  // Vérifier mot de passe
  static async verifyPassword(email, password) {
    const user = await this.findByEmail(email);
    if (!user) return null;
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    return isValid ? user : null;
  }

  // Mettre à jour espace utilisé
  static async updateUsedSpace(userId, additionalBytes) {
    await pool.query(
      'UPDATE Users SET used_space = used_space + $1 WHERE id = $2',
      [additionalBytes, userId]
    );
  }
}

module.exports = User;