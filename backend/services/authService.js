const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/database');

class AuthService {
  static async login(email, password) {
    const result = await pool.query(
      'SELECT id, email, password_hash FROM Users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) return null;
    
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) return null;
    
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    return { token, user: { id: user.id, email: user.email } };
  }
}

module.exports = AuthService;