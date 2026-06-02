// routes/loginRoutes.js
const express = require('express');
const LoginController = require('../controllers/login');
const router = express.Router();

router.post('/init', LoginController.initiateLogin);
router.post('/verify-signatures', LoginController.verifySignatures);
router.post('/send-otp', LoginController.sendOTP);
router.post('/verify-otp', LoginController.verifyOTP);
router.post('/refresh', LoginController.refreshToken);
// router.post('/logout', LoginController.logout);

module.exports = router;