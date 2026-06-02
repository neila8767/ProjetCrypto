// routes/loginRoutes.js
const express = require('express');
const SharesController = require('../controllers/shareController');
const router = express.Router();

const { authenticateToken } = require('../middleware/authMiddleware');
router.use(authenticateToken);

// Routes pour les partages
router.get('/shared-by-me', SharesController.getSharedByMe);
router.get('/shared-with-me',  SharesController.getSharedWithMe);
router.post('/shares', SharesController.createShare);
router.delete('/shares/:shareId', SharesController.revokeShare);
module.exports = router;