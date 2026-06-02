const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { upload } = require('../config/storage');
const UploadController = require('../controllers/uploadController');
const FileController = require('../controllers/fileController');

router.use(authenticateToken);

router.put('/files/:fileId', FileController.renameFile);
router.get('/files', FileController.getFilesByFolder);
router.post('/upload', upload.single('file'), UploadController.uploadFile);
router.get('/files/user', FileController.getUserFiles);
router.get('/files/:fileId/download', FileController.getFileForDownload);
router.delete('/files/:fileId', FileController.deleteFile);

module.exports = router;