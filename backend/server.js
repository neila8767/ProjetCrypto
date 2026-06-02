require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ========== ROUTES (backend inscription de ton amie) ==========
const authFusRoutes = require('./routes/authRoutes_fus');
app.use('/api/fus', authFusRoutes);

const loginRoutes = require('./routes/loginRoutes');
app.use('/api/auth/login', loginRoutes);

//gestion des fichiers
const fileRoutes = require('./routes/fileRoutes');
app.use('/api', fileRoutes);

// ========== NOUVELLES ROUTES POUR DOSSIERS ==========
const folderRoutes = require('./routes/folderRoutes');
app.use('/api', folderRoutes);

// ========== NOUVELLES ROUTES POUR PARTAGES ==========
const sharesRoutes = require('./routes/shareRoutes');
app.use('/api', sharesRoutes);
// ========== NOUVELLES ROUTES POUR PARTAGES ==========
const sharesfileroutes = require('./routes/sharefileRoutes');
app.use('/api', sharesfileroutes);

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route non trouvée' });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ success: false, error: 'Erreur interne du serveur' });
});

// Démarrage
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📝 Environnement: ${process.env.NODE_ENV || 'development'}`);
console.log("JWT_SECRET =", process.env.JWT_SECRET);
});

