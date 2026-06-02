const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  console.log("📩 AUTH HEADER =", authHeader);

  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log("❌ NO TOKEN");
    return res.status(401).json({
      success: false,
      error: 'Token d\'authentification requis'
    });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);

    console.log("✅ TOKEN OK =", user);

    req.user = { userId: user.userId, ...user };

    next();

  } catch (err) {

    console.log("❌ JWT ERROR =", err.message);

    return res.status(403).json({
      success: false,
      error: 'Token invalide ou expiré',
      details: err.message
    });
  }
};

module.exports = { authenticateToken };