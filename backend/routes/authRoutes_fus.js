const express = require('express');
const router = express.Router();
const AuthFusController = require('../controllers/authController_fus');

router.post('/register-verifier', AuthFusController.registerVerifier);
router.get('/activate', AuthFusController.activateAccount);

module.exports = router;
module.exports = router;