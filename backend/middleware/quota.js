const checkQuota = async (req, res, next) => {
  try {
    const fileSize = parseInt(req.headers['x-file-size'] || req.body.size || 0);
    
    if (!fileSize) {
      return next();
    }

    // Simple quota check - sera implémenté plus tard
    req.quotaInfo = {
      available: fileSize + 1000000,
      currentUsed: 0,
      maxQuota: 1073741824,
      newTotal: fileSize
    };
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: error.message });
  }
};

module.exports = checkQuota;