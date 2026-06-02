// routes/loginRoutes.js
const express = require('express');

const { authenticateToken } = require('../middleware/authMiddleware');
const FoldersController = require('../controllers/folderController');
const router = express.Router();

router.use(authenticateToken);


// Routes pour les dossiers
router.put('/folders/:folderId', FoldersController.renameFolder);
router.get('/folders',  FoldersController.getUserFolders);
router.post('/folders',  FoldersController.createFolder);
router.delete('/folders/:folderId', FoldersController.deleteFolder);

module.exports = router;