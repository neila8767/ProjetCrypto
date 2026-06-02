// dashboard/Dashboard.jsx - Version avec partages (incrémentale)
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [files, setFiles] = useState([]);
  const [sharedWithMe, setSharedWithMe] = useState([]);
  const [sharedByMe, setSharedByMe] = useState([]);
  const [folders, setFolders] = useState([]);
  const [friends, setFriends] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [currentTab, setCurrentTab] = useState('my-files');
  const [quota, setQuota] = useState({ used: 0, max: 10737418240 });
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [checkingExtension, setCheckingExtension] = useState(true);
  
  // Modals state
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState('read');
  const [shareExpiresIn, setShareExpiresIn] = useState('7d');
  const [shareLoading, setShareLoading] = useState(false);
  
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [addFriendLoading, setAddFriendLoading] = useState(false);
  
  const fileInputRef = useRef(null);

  // Vérifier la présence de l'extension SecureCloud
  useEffect(() => {
    const checkExtension = async () => {
      try {
        setCheckingExtension(true);
        
        let attempts = 0;
        while (!window.myWallet && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (window.myWallet) {
          setExtensionDetected(true);
          console.log('✅ Extension SecureCloud détectée');
          
          const isUnlocked = await window.myWallet.isUnlocked();
          if (!isUnlocked?.unlocked) {
            console.log('🔒 Wallet verrouillé, ouverture de la popup...');
            await window.myWallet.openPopup();
          }
          
          await loadData();
        } else {
          setExtensionDetected(false);
          console.log('❌ Extension SecureCloud non détectée');
          setLoading(false);
        }
      } catch (err) {
        console.error('Erreur détection extension:', err);
        setExtensionDetected(false);
        setLoading(false);
      } finally {
        setCheckingExtension(false);
      }
    };
    
    checkExtension();
    
    window.addEventListener('securecloud:ready', () => {
      console.log('🎉 [CLIENT] Événement securecloud:ready reçu');
      setExtensionDetected(true);
      setCheckingExtension(false);
      loadData();
    });
    
    return () => {
      window.removeEventListener('securecloud:ready', () => {});
    };
  }, []);

  // Charger les données du dashboard
  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadFiles(),
        loadSharedWithMe(),
        loadSharedByMe(),
        loadFolders(),
        loadQuota(),
        loadFriends()
      ]);
    } catch (err) {
      console.error('Erreur chargement données:', err);
    } finally {
      setLoading(false);
    }
  };

  // Charger mes fichiers
  const loadFiles = async () => {
    try {
      const res = await axios.get('/api/files', {
        params: { folderId: currentFolder?.id }
      });
      setFiles(res.data.files || []);
    } catch (err) {
      console.error('Erreur chargement fichiers:', err);
      if (err.response?.status === 401) {
        logout();
        navigate('/login');
      }
    }
  };

  // Charger les fichiers partagés avec moi
  const loadSharedWithMe = async () => {
    try {
      const res = await axios.get('/api/files/shared-with-me');
      setSharedWithMe(res.data.files || []);
    } catch (err) {
      console.error('Erreur chargement fichiers partagés:', err);
    }
  };

  // Charger les fichiers que j'ai partagés
  const loadSharedByMe = async () => {
    try {
      const res = await axios.get('/api/files/shared-by-me');
      setSharedByMe(res.data.files || []);
    } catch (err) {
      console.error('Erreur chargement mes partages:', err);
    }
  };

  // Charger les dossiers
  const loadFolders = async () => {
    try {
      const res = await axios.get('/api/folders');
      setFolders(res.data.folders || []);
    } catch (err) {
      console.error('Erreur chargement dossiers:', err);
    }
  };

  // Charger le quota
  const loadQuota = async () => {
    try {
      const res = await axios.get('/api/user/quota');
      setQuota(res.data);
    } catch (err) {
      console.error('Erreur chargement quota:', err);
    }
  };

  // Charger la liste des amis/contacts
  const loadFriends = async () => {
    try {
      const res = await axios.get('/api/user/friends');
      setFriends(res.data.friends || []);
    } catch (err) {
      console.error('Erreur chargement amis:', err);
    }
  };

  // Ajouter un ami
  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (!friendEmail.trim()) return;
    
    setAddFriendLoading(true);
    try {
      await axios.post('/api/user/friends', { email: friendEmail });
      await loadFriends();
      setShowAddFriendModal(false);
      setFriendEmail('');
      alert(`✅ ${friendEmail} ajouté à vos contacts`);
    } catch (err) {
      console.error('Erreur ajout ami:', err);
      alert(err.response?.data?.error || 'Erreur lors de l\'ajout');
    } finally {
      setAddFriendLoading(false);
    }
  };

  // Partager un fichier
  const handleShare = async (e) => {
    e.preventDefault();
    if (!shareEmail.trim()) return;
    
    setShareLoading(true);
    try {
      await axios.post(`/api/files/${selectedFile.id}/share`, {
        email: shareEmail,
        permission: sharePermission,
        expiresIn: shareExpiresIn
      });
      
      setShowShareModal(false);
      setSelectedFile(null);
      setShareEmail('');
      setSharePermission('read');
      setShareExpiresIn('7d');
      
      alert(`✅ Fichier partagé avec ${shareEmail}`);
      await loadSharedByMe();
      
    } catch (err) {
      console.error('❌ Erreur partage:', err);
      alert(err.response?.data?.error || 'Erreur lors du partage');
    } finally {
      setShareLoading(false);
    }
  };

  // Révoquer un partage
  const handleRevokeShare = async (shareId) => {
    if (!confirm('Retirer l\'accès à ce fichier ?')) return;
    
    try {
      await axios.delete(`/api/shares/${shareId}`);
      await loadSharedByMe();
      alert('✅ Accès révoqué');
    } catch (err) {
      console.error('Erreur révocation:', err);
      alert('Erreur lors de la révocation');
    }
  };

  // Téléverser un fichier (inchangé)
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!extensionDetected) {
      alert('Extension SecureCloud non détectée');
      return;
    }
    
    if (quota.used + file.size > quota.max) {
      alert(`Quota insuffisant. Espace disponible: ${formatSize(quota.max - quota.used)}`);
      return;
    }
    
    setUploading(true);
    
    try {
      const fileBuffer = await file.arrayBuffer();
      
      console.log('🔐 Chiffrement du fichier via extension...');
      const encryptionResult = await window.myWallet.encryptFile({
        file: new Uint8Array(fileBuffer),
        accountId: 'personal',
        metadata: { name: file.name, type: file.type, size: file.size }
      });
      
      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(encryptionResult.encryptedFile)]), file.name);
      formData.append('encryptedKey', JSON.stringify(encryptionResult.encryptedKey));
      formData.append('iv', JSON.stringify(encryptionResult.iv));
      formData.append('accountId', encryptionResult.accountId);
      formData.append('name', file.name);
      formData.append('size', file.size);
      formData.append('type', file.type);
      formData.append('hash', encryptionResult.hash);
      formData.append('folderId', currentFolder?.id || '');
      
      await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      await loadFiles();
      await loadQuota();
      if (fileInputRef.current) fileInputRef.current.value = '';
      
    } catch (err) {
      console.error('❌ Erreur upload:', err);
      alert('Erreur lors du téléversement');
    } finally {
      setUploading(false);
    }
  };

  // Télécharger un fichier (inchangé)
  const handleDownload = async (file) => {
    if (!extensionDetected) {
      alert('Extension SecureCloud non détectée');
      return;
    }
    
    setDownloading(true);
    
    try {
      const res = await axios.get(`/api/files/${file.id}/download`, {
        responseType: 'json'
      });
      
      console.log('🔐 Déchiffrement du fichier via extension...');
      const decryptionResult = await window.myWallet.decryptFile({
        encryptedFile: new Uint8Array(res.data.encryptedFile),
        encryptedKey: new Uint8Array(res.data.encryptedKey),
        iv: new Uint8Array(res.data.iv),
        accountId: file.accountId
      });
      
      const blob = new Blob([new Uint8Array(decryptionResult.decryptedFile)], { type: file.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error('❌ Erreur téléchargement:', err);
      alert('Erreur lors du téléchargement');
    } finally {
      setDownloading(false);
    }
  };

  // Supprimer un fichier
  const handleDelete = async (file) => {
    if (!confirm(`Supprimer "${file.name}" ?`)) return;
    
    try {
      await axios.delete(`/api/files/${file.id}`);
      await loadFiles();
      await loadQuota();
    } catch (err) {
      console.error('❌ Erreur suppression:', err);
      alert('Erreur lors de la suppression');
    }
  };

  // Créer un dossier
  const handleCreateFolder = async () => {
    const folderName = prompt('Nom du dossier:');
    if (!folderName?.trim()) return;
    
    try {
      await axios.post('/api/folders', { name: folderName });
      await loadFolders();
    } catch (err) {
      console.error('❌ Erreur création dossier:', err);
      alert('Erreur lors de la création du dossier');
    }
  };

  // Changer de dossier
  const handleFolderChange = async (folder) => {
    setCurrentFolder(folder);
    await loadFiles();
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const quotaPercentage = (quota.used / quota.max) * 100;

  // Rendu du modal de partage
  const renderShareModal = () => (
    <div className="modal-overlay">
      <div className="modal">
        <h3>🔗 Partager "{selectedFile?.name}"</h3>
        
        <form onSubmit={handleShare}>
          <div className="form-group">
            <label>Email du destinataire</label>
            <input
              type="email"
              placeholder="ami@exemple.com"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          
          <div className="form-group">
            <label>Permission</label>
            <select value={sharePermission} onChange={(e) => setSharePermission(e.target.value)}>
              <option value="read">📖 Lecture seule</option>
              <option value="write">✏️ Lecture et écriture</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Expiration</label>
            <select value={shareExpiresIn} onChange={(e) => setShareExpiresIn(e.target.value)}>
              <option value="1h">1 heure</option>
              <option value="24h">24 heures</option>
              <option value="7d">7 jours</option>
              <option value="30d">30 jours</option>
            </select>
          </div>
          
          {friends.length > 0 && (
            <div className="friends-list">
              <label>Ou choisir un contact :</label>
              <div className="friends-buttons">
                {friends.slice(0, 5).map(friend => (
                  <button
                    key={friend.id}
                    type="button"
                    className="friend-btn"
                    onClick={() => setShareEmail(friend.email)}
                  >
                    👤 {friend.email}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={() => setShowShareModal(false)}>
              Annuler
            </button>
            <button type="submit" className="modal-btn modal-btn-confirm" disabled={shareLoading}>
              {shareLoading ? 'Partage...' : 'Partager'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Rendu du modal d'ajout d'ami
  const renderAddFriendModal = () => (
    <div className="modal-overlay">
      <div className="modal">
        <h3>👥 Ajouter un contact</h3>
        <form onSubmit={handleAddFriend}>
          <input
            type="email"
            placeholder="email@exemple.com"
            value={friendEmail}
            onChange={(e) => setFriendEmail(e.target.value)}
            required
            autoFocus
          />
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={() => setShowAddFriendModal(false)}>
              Annuler
            </button>
            <button type="submit" className="modal-btn modal-btn-confirm" disabled={addFriendLoading}>
              {addFriendLoading ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (loading || checkingExtension) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p className="loading-text">
          {checkingExtension ? 'RECHERCHE DE L\'EXTENSION SECURECLOUD...' : 'CHARGEMENT DE VOTRE ESPACE SÉCURISÉ...'}
        </p>
      </div>
    );
  }

  if (!extensionDetected) {
    return (
      <div className="dashboard-loading">
        <div className="alert alert-error" style={{ maxWidth: 500, margin: '20px' }}>
          <span className="alert-icon">⚠️</span>
          <div>
            <p style={{ marginBottom: 10 }}>Extension SecureCloud non détectée.</p>
            <button onClick={() => window.myWallet?.openPopup?.()} className="error-action-btn">
              INSTALLER / OUVRIR
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="scanline"></div>
      
      <header className="dashboard-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-hex">
              <svg viewBox="0 0 40 40" fill="none">
                <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="#00b4ff" strokeWidth="1" fill="rgba(0,180,255,0.08)" />
                <polygon points="20,8 32,15 32,25 20,32 8,25 8,15" stroke="#00ffea" strokeWidth="0.5" fill="rgba(0,255,234,0.04)" />
                <text x="20" y="24" textAnchor="middle" fill="#00b4ff" fontSize="10" fontFamily="'Share Tech Mono'" fontWeight="bold">DS</text>
              </svg>
            </div>
            <div className="logo-text-container">
              <span className="logo-text">DRIVESECURE</span>
              <span className="logo-sub">ENCRYPTED STORAGE v2.0</span>
            </div>
          </div>
          <div className="user-info">
            <span className="user-email">{user?.email}</span>
            <button onClick={logout} className="logout-btn">DÉCONNEXION</button>
          </div>
        </div>
      </header>
      
      <main className="dashboard-main">
        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-icon">📊</span>
              <span className="stat-title">ESPACE UTILISÉ</span>
            </div>
            <div className="stat-value">{formatSize(quota.used)}</div>
            <div className="stat-sub">sur {formatSize(quota.max)}</div>
            <div className="strength-bar" style={{ marginTop: 12 }}>
              <div className="strength-seg" style={{ width: `${Math.min(quotaPercentage, 100)}%`, background: quotaPercentage > 90 ? '#ff4d6d' : quotaPercentage > 70 ? '#ffb340' : '#00e5a0' }}></div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-icon">📁</span>
              <span className="stat-title">FICHIERS</span>
            </div>
            <div className="stat-value">{files.length}</div>
            <div className="stat-sub">dans {currentFolder?.name || 'Racine'}</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-icon">🔗</span>
              <span className="stat-title">PARTAGÉS</span>
            </div>
            <div className="stat-value">{sharedByMe.length}</div>
            <div className="stat-sub">fichiers partagés</div>
          </div>
          
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-icon">👥</span>
              <span className="stat-title">CONTACTS</span>
            </div>
            <div className="stat-value">{friends.length}</div>
            <div className="stat-sub">amis / collaborateurs</div>
          </div>
        </div>
        
        {/* Onglets */}
        <div className="tabs-container">
          <button 
            className={`tab-btn ${currentTab === 'my-files' ? 'active' : ''}`}
            onClick={() => setCurrentTab('my-files')}
          >
            📁 MES FICHIERS
          </button>
          <button 
            className={`tab-btn ${currentTab === 'shared-with-me' ? 'active' : ''}`}
            onClick={() => setCurrentTab('shared-with-me')}
          >
            🔗 PARTAGÉS AVEC MOI
          </button>
          <button 
            className={`tab-btn ${currentTab === 'shared-by-me' ? 'active' : ''}`}
            onClick={() => setCurrentTab('shared-by-me')}
          >
            📤 MES PARTAGES
          </button>
          <button 
            className="tab-btn add-friend"
            onClick={() => setShowAddFriendModal(true)}
          >
            👥 + AJOUTER CONTACT
          </button>
        </div>
        
        {/* Folders Section (uniquement pour mes fichiers) */}
        {currentTab === 'my-files' && (
          <div className="accounts-section">
            <div className="section-header">
              <div className="section-title">
                <span className="section-title-icon">🗂️</span>
                <span>DOSSIERS</span>
              </div>
              <div className="section-actions">
                <button onClick={handleCreateFolder} className="action-icon-btn">
                  ➕ NOUVEAU DOSSIER
                </button>
              </div>
            </div>
            
            <div className="accounts-grid">
              <div 
                className={`account-card ${!currentFolder ? 'active' : ''}`}
                onClick={() => handleFolderChange(null)}
              >
                <div className="account-header">
                  <div className="account-icon">🏠</div>
                  <div className="account-info">
                    <div className="account-name">Racine</div>
                    <div className="account-type">Dossier principal</div>
                  </div>
                </div>
              </div>
              
              {folders.map(folder => (
                <div 
                  key={folder.id}
                  className={`account-card ${currentFolder?.id === folder.id ? 'active' : ''}`}
                  onClick={() => handleFolderChange(folder)}
                >
                  <div className="account-header">
                    <div className="account-icon">📁</div>
                    <div className="account-info">
                      <div className="account-name">{folder.name}</div>
                      <div className="account-type">Créé le {new Date(folder.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Files Section */}
        <div className="files-section">
          <div className="files-header">
            <div className="section-title">
              <span className="section-title-icon">📄</span>
              <span>
                {currentTab === 'my-files' && `MES FICHIERS ${currentFolder?.name ? `- ${currentFolder.name}` : ''}`}
                {currentTab === 'shared-with-me' && 'PARTAGÉS AVEC MOI'}
                {currentTab === 'shared-by-me' && 'MES PARTAGES'}
              </span>
            </div>
            {currentTab === 'my-files' && (
              <div className="section-actions">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="upload-btn" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                  {uploading ? '⏳ CHIFFREMENT...' : '📤 TÉLÉVERSER'}
                </label>
              </div>
            )}
          </div>
          
          {(() => {
            let currentFiles = [];
            if (currentTab === 'my-files') currentFiles = files;
            else if (currentTab === 'shared-with-me') currentFiles = sharedWithMe;
            else currentFiles = sharedByMe;
            
            if (currentFiles.length === 0) {
              return (
                <div className="empty-files">
                  <div className="empty-icon">📭</div>
                  <p className="empty-text">
                    {currentTab === 'my-files' && 'AUCUN FICHIER DANS CET ESPACE'}
                    {currentTab === 'shared-with-me' && 'AUCUN FICHIER PARTAGÉ AVEC VOUS'}
                    {currentTab === 'shared-by-me' && 'VOUS N\'AVEZ PARTAGÉ AUCUN FICHIER'}
                  </p>
                  {currentTab === 'my-files' && (
                    <p className="empty-text" style={{ fontSize: 10 }}>Cliquez sur "TÉLÉVERSER" pour ajouter vos premiers fichiers chiffrés</p>
                  )}
                </div>
              );
            }
            
            return (
              <div className="files-list">
                {currentFiles.map(file => (
                  <div key={file.id} className="file-item">
                    <div className="file-info">
                      <div className="file-icon">📄</div>
                      <div className="file-details">
                        <div className="file-name">{file.name}</div>
                        <div className="file-meta">
                          <span className="file-size">📦 {formatSize(file.size)}</span>
                          <span className="file-date">📅 {new Date(file.createdAt).toLocaleDateString()}</span>
                          {file.sharedBy && (
                            <span className="file-shared">👤 Partagé par {file.sharedBy}</span>
                          )}
                          {file.permission === 'write' && (
                            <span className="file-permission-write">✏️ Écriture</span>
                          )}
                          {file.expiresAt && (
                            <span className="file-expiry">⏰ Expire le {new Date(file.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="file-actions">
                      <button className="file-btn download" onClick={() => handleDownload(file)} disabled={downloading}>
                        ⬇️ TÉLÉCHARGER
                      </button>
                      {currentTab === 'my-files' && (
                        <>
                          <button className="file-btn" onClick={() => {
                            setSelectedFile(file);
                            setShowShareModal(true);
                          }}>
                            🔗 PARTAGER
                          </button>
                          <button className="file-btn delete" onClick={() => handleDelete(file)}>
                            🗑️ SUPPRIMER
                          </button>
                        </>
                      )}
                      {currentTab === 'shared-by-me' && file.shareId && (
                        <button className="file-btn delete" onClick={() => handleRevokeShare(file.shareId)}>
                          🔒 RÉVOQUER
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </main>
      
      {/* Modals */}
      {showShareModal && renderShareModal()}
      {showAddFriendModal && renderAddFriendModal()}
    </div>
  );
}

// import React, { useState, useEffect, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
// import axios from 'axios';
// import { useAuth } from '../../contexts/AuthContext';
// import './Dashboard.css';

// export default function Dashboard() {
//   const navigate = useNavigate();
//   const { user, logout } = useAuth();
  
//   const [loading, setLoading] = useState(true);
//   const [uploading, setUploading] = useState(false);
//   const [downloading, setDownloading] = useState(false);
//   const [files, setFiles] = useState([]);
//   const [folders, setFolders] = useState([]);
//   const [currentFolder, setCurrentFolder] = useState(null);
//   const [quota, setQuota] = useState({ used: 0, max: 10737418240 }); // 10GB default
//   const [extensionDetected, setExtensionDetected] = useState(false);
//   const [checkingExtension, setCheckingExtension] = useState(true);
  
//   const fileInputRef = useRef(null);

//   // Vérifier la présence de l'extension SecureCloud
//   useEffect(() => {
//     const checkExtension = async () => {
//       try {
//         setCheckingExtension(true);
        
//         let attempts = 0;
//         while (!window.myWallet && attempts < 50) {
//           await new Promise(resolve => setTimeout(resolve, 100));
//           attempts++;
//         }
        
//         if (window.myWallet) {
//           setExtensionDetected(true);
//           console.log('✅ Extension SecureCloud détectée');
          
//           // Vérifier que le wallet est déverrouillé
//           const isUnlocked = await window.myWallet.isUnlocked();
//           if (!isUnlocked?.unlocked) {
//             console.log('🔒 Wallet verrouillé, ouverture de la popup...');
//             await window.myWallet.openPopup();
//           }
          
//           await loadData();
//         } else {
//           setExtensionDetected(false);
//           console.log('❌ Extension SecureCloud non détectée');
//         }
//       } catch (err) {
//         console.error('Erreur détection extension:', err);
//         setExtensionDetected(false);
//       } finally {
//         setCheckingExtension(false);
//       }
//     };
    
//     checkExtension();
    
//     window.addEventListener('securecloud:ready', () => {
//       console.log('🎉 [CLIENT] Événement securecloud:ready reçu');
//       setExtensionDetected(true);
//       setCheckingExtension(false);
//       loadData();
//     });
    
//     return () => {
//       window.removeEventListener('securecloud:ready', () => {});
//     };
//   }, []);

//   // Charger les données du dashboard
//   const loadData = async () => {
//     setLoading(true);
//     try {
//       await Promise.all([
//         loadFiles(),
//         loadFolders(),
//         loadQuota()
//       ]);
//     } catch (err) {
//       console.error('Erreur chargement données:', err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Charger les fichiers
//   const loadFiles = async () => {
//     try {
//       const res = await axios.get('/api/files', {
//         params: { folderId: currentFolder?.id }
//       });
//       setFiles(res.data.files || []);
//     } catch (err) {
//       console.error('Erreur chargement fichiers:', err);
//       if (err.response?.status === 401) {
//         logout();
//         navigate('/login');
//       }
//     }
//   };

//   // Charger les dossiers
//   const loadFolders = async () => {
//     try {
//       const res = await axios.get('/api/folders');
//       setFolders(res.data.folders || []);
//     } catch (err) {
//       console.error('Erreur chargement dossiers:', err);
//     }
//   };

//   // Charger le quota
//   const loadQuota = async () => {
//     try {
//       const res = await axios.get('/api/user/quota');
//       setQuota(res.data);
//     } catch (err) {
//       console.error('Erreur chargement quota:', err);
//     }
//   };

//   // Calculer la taille formatée
//   const formatSize = (bytes) => {
//     if (bytes === 0) return '0 B';
//     const k = 1024;
//     const sizes = ['B', 'KB', 'MB', 'GB'];
//     const i = Math.floor(Math.log(bytes) / Math.log(k));
//     return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
//   };

//   // Calculer le pourcentage du quota
//   const quotaPercentage = (quota.used / quota.max) * 100;

//   // Téléverser un fichier (chiffré via l'extension)
//   const handleFileUpload = async (event) => {
//     const file = event.target.files[0];
//     if (!file) return;
    
//     if (!extensionDetected) {
//       alert('Extension SecureCloud non détectée');
//       return;
//     }
    
//     setUploading(true);
    
//     try {
//       // 1. Vérifier le quota
//       if (quota.used + file.size > quota.max) {
//         alert(`Quota insuffisant. Espace disponible: ${formatSize(quota.max - quota.used)}`);
//         return;
//       }
      
//       // 2. Lire le fichier
//       const fileBuffer = await file.arrayBuffer();
      
//       // 3. 🔐 Appeler l'extension pour chiffrer le fichier
//       console.log('🔐 Chiffrement du fichier via extension...');
//       const encryptionResult = await window.myWallet.encryptFile({
//         file: new Uint8Array(fileBuffer),
//         accountId: 'personal', // Utiliser le compte personnel pour le chiffrement
//         metadata: {
//           name: file.name,
//           type: file.type,
//           size: file.size
//         }
//       });
      
//       console.log('✅ Fichier chiffré, taille:', encryptionResult.encryptedFile.length);
      
//       // 4. Créer FormData pour l'envoi
//       const formData = new FormData();
//       formData.append('file', new Blob([new Uint8Array(encryptionResult.encryptedFile)]), file.name);
//       formData.append('encryptedKey', JSON.stringify(encryptionResult.encryptedKey));
//       formData.append('iv', JSON.stringify(encryptionResult.iv));
//       formData.append('accountId', encryptionResult.accountId);
//       formData.append('name', file.name);
//       formData.append('size', file.size);
//       formData.append('type', file.type);
//       formData.append('hash', encryptionResult.hash);
//       formData.append('folderId', currentFolder?.id || '');
      
//       // 5. Envoyer au serveur
//       const res = await axios.post('/api/upload', formData, {
//         headers: { 'Content-Type': 'multipart/form-data' }
//       });
      
//       console.log('✅ Fichier téléversé:', res.data);
      
//       // 6. Recharger la liste des fichiers
//       await loadFiles();
//       await loadQuota();
      
//       // 7. Réinitialiser l'input
//       if (fileInputRef.current) fileInputRef.current.value = '';
      
//     } catch (err) {
//       console.error('❌ Erreur upload:', err);
//       alert('Erreur lors du téléversement: ' + (err.response?.data?.error || err.message));
//     } finally {
//       setUploading(false);
//     }
//   };

//   // Télécharger un fichier (déchiffré via l'extension)
//   const handleDownload = async (file) => {
//     if (!extensionDetected) {
//       alert('Extension SecureCloud non détectée');
//       return;
//     }
    
//     setDownloading(true);
    
//     try {
//       // 1. Récupérer le fichier chiffré
//       const res = await axios.get(`/api/files/${file.id}/download`, {
//         responseType: 'json'
//       });
      
//       // 2. 🔐 Appeler l'extension pour déchiffrer le fichier
//       console.log('🔐 Déchiffrement du fichier via extension...');
//       const decryptionResult = await window.myWallet.decryptFile({
//         encryptedFile: new Uint8Array(res.data.encryptedFile),
//         encryptedKey: new Uint8Array(res.data.encryptedKey),
//         iv: new Uint8Array(res.data.iv),
//         accountId: file.accountId
//       });
      
//       console.log('✅ Fichier déchiffré, taille:', decryptionResult.decryptedFile.length);
      
//       // 3. Créer un blob et le télécharger
//       const blob = new Blob([new Uint8Array(decryptionResult.decryptedFile)], { type: file.type });
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url;
//       a.download = file.name;
//       document.body.appendChild(a);
//       a.click();
//       document.body.removeChild(a);
//       URL.revokeObjectURL(url);
      
//       console.log('✅ Fichier téléchargé:', file.name);
      
//     } catch (err) {
//       console.error('❌ Erreur téléchargement:', err);
//       alert('Erreur lors du téléchargement: ' + (err.response?.data?.error || err.message));
//     } finally {
//       setDownloading(false);
//     }
//   };

//   // Supprimer un fichier
//   const handleDelete = async (file) => {
//     if (!confirm(`Supprimer "${file.name}" ?`)) return;
    
//     try {
//       await axios.delete(`/api/files/${file.id}`);
//       await loadFiles();
//       await loadQuota();
//       console.log('✅ Fichier supprimé:', file.name);
//     } catch (err) {
//       console.error('❌ Erreur suppression:', err);
//       alert('Erreur lors de la suppression');
//     }
//   };

//   // Créer un dossier
//   const handleCreateFolder = async (e) => {
//     e.preventDefault();
//     const folderName = prompt('Nom du dossier:');
//     if (!folderName?.trim()) return;
    
//     try {
//       await axios.post('/api/folders', { name: folderName });
//       await loadFolders();
//     } catch (err) {
//       console.error('❌ Erreur création dossier:', err);
//       alert('Erreur lors de la création du dossier');
//     }
//   };

//   // Changer de dossier
//   const handleFolderChange = async (folder) => {
//     setCurrentFolder(folder);
//     await loadFiles();
//   };

//   // Partager un fichier
//   const handleShare = async (file) => {
//     const email = prompt('Email de la personne avec qui partager:');
//     if (!email?.trim()) return;
    
//     try {
//       await axios.post(`/api/files/${file.id}/share`, { email });
//       alert(`Fichier partagé avec ${email}`);
//     } catch (err) {
//       console.error('❌ Erreur partage:', err);
//       alert('Erreur lors du partage');
//     }
//   };

//   // Déconnexion
//   const handleLogout = () => {
//     logout();
//     navigate('/login');
//   };

//   // Ouvrir l'extension
//   const handleOpenExtension = async () => {
//     if (window.myWallet?.openPopup) {
//       await window.myWallet.openPopup();
//     } else if (chrome?.runtime?.id) {
//       window.open(`chrome-extension://${chrome.runtime.id}/popup.html`, '_blank');
//     }
//   };

//   if (loading || checkingExtension) {
//     return (
//       <div className="dashboard-loading">
//         <div className="spinner"></div>
//         <p className="loading-text">
//           {checkingExtension ? 'RECHERCHE DE L\'EXTENSION SECURECLOUD...' : 'CHARGEMENT DE VOTRE ESPACE SÉCURISÉ...'}
//         </p>
//       </div>
//     );
//   }

//   if (!extensionDetected) {
//     return (
//       <div className="dashboard-loading">
//         <div className="alert alert-error" style={{ maxWidth: 500, margin: '20px' }}>
//           <span className="alert-icon">⚠️</span>
//           <div>
//             <p style={{ marginBottom: 10 }}>Extension SecureCloud non détectée.</p>
//             <button onClick={handleOpenExtension} className="error-action-btn">
//               INSTALLER / OUVRIR
//             </button>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="dashboard-page">
//       <div className="scanline"></div>
      
//       {/* Header */}
//       <header className="dashboard-header">
//         <div className="header-content">
//           <div className="logo-section">
//             <div className="logo-hex">
//               <svg viewBox="0 0 40 40" fill="none">
//                 <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="#00b4ff" strokeWidth="1" fill="rgba(0,180,255,0.08)" />
//                 <polygon points="20,8 32,15 32,25 20,32 8,25 8,15" stroke="#00ffea" strokeWidth="0.5" fill="rgba(0,255,234,0.04)" />
//                 <text x="20" y="24" textAnchor="middle" fill="#00b4ff" fontSize="10" fontFamily="'Share Tech Mono'" fontWeight="bold">DS</text>
//               </svg>
//             </div>
//             <div className="logo-text-container">
//               <span className="logo-text">DRIVESECURE</span>
//               <span className="logo-sub">ENCRYPTED STORAGE v2.0</span>
//             </div>
//           </div>
//           <div className="user-info">
//             <span className="user-email">{user?.email}</span>
//             <button onClick={handleLogout} className="logout-btn">DÉCONNEXION</button>
//           </div>
//         </div>
//       </header>
      
//       {/* Main Content */}
//       <main className="dashboard-main">
//         {/* Stats Cards */}
//         <div className="stats-grid">
//           <div className="stat-card">
//             <div className="stat-header">
//               <span className="stat-icon">📊</span>
//               <span className="stat-title">ESPACE UTILISÉ</span>
//             </div>
//             <div className="stat-value">{formatSize(quota.used)}</div>
//             <div className="stat-sub">sur {formatSize(quota.max)}</div>
//             <div className="strength-bar" style={{ marginTop: 12 }}>
//               <div className="strength-seg" style={{ width: `${Math.min(quotaPercentage, 100)}%`, background: quotaPercentage > 90 ? '#ff4d6d' : quotaPercentage > 70 ? '#ffb340' : '#00e5a0' }}></div>
//             </div>
//           </div>
          
//           <div className="stat-card">
//             <div className="stat-header">
//               <span className="stat-icon">📁</span>
//               <span className="stat-title">FICHIERS</span>
//             </div>
//             <div className="stat-value">{files.length}</div>
//             <div className="stat-sub">dans {currentFolder?.name || 'Racine'}</div>
//           </div>
          
//           <div className="stat-card">
//             <div className="stat-header">
//               <span className="stat-icon">🗂️</span>
//               <span className="stat-title">DOSSIERS</span>
//             </div>
//             <div className="stat-value">{folders.length}</div>
//             <div className="stat-sub">espaces de travail</div>
//           </div>
          
//           <div className="stat-card">
//             <div className="stat-header">
//               <span className="stat-icon">🔐</span>
//               <span className="stat-title">STATUT</span>
//             </div>
//             <div className="stat-value">SECURECLOUD</div>
//             <div className="stat-sub">wallet actif</div>
//           </div>
//         </div>
        
//         {/* Folders Section */}
//         <div className="accounts-section">
//           <div className="section-header">
//             <div className="section-title">
//               <span className="section-title-icon">🗂️</span>
//               <span>DOSSIERS</span>
//             </div>
//             <div className="section-actions">
//               <button onClick={handleCreateFolder} className="action-icon-btn">
//                 ➕ NOUVEAU DOSSIER
//               </button>
//             </div>
//           </div>
          
//           <div className="accounts-grid">
//             <div 
//               className={`account-card ${!currentFolder ? 'active' : ''}`}
//               onClick={() => handleFolderChange(null)}
//             >
//               <div className="account-header">
//                 <div className="account-icon">🏠</div>
//                 <div className="account-info">
//                   <div className="account-name">Racine</div>
//                   <div className="account-type">Dossier principal</div>
//                 </div>
//               </div>
//             </div>
            
//             {folders.map(folder => (
//               <div 
//                 key={folder.id}
//                 className={`account-card ${currentFolder?.id === folder.id ? 'active' : ''}`}
//                 onClick={() => handleFolderChange(folder)}
//               >
//                 <div className="account-header">
//                   <div className="account-icon">📁</div>
//                   <div className="account-info">
//                     <div className="account-name">{folder.name}</div>
//                     <div className="account-type">Créé le {new Date(folder.createdAt).toLocaleDateString()}</div>
//                   </div>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
        
//         {/* Files Section */}
//         <div className="files-section">
//           <div className="files-header">
//             <div className="section-title">
//               <span className="section-title-icon">📄</span>
//               <span>FICHIERS {currentFolder?.name ? `- ${currentFolder.name}` : ''}</span>
//             </div>
//             <div className="section-actions">
//               <input
//                 type="file"
//                 ref={fileInputRef}
//                 onChange={handleFileUpload}
//                 style={{ display: 'none' }}
//                 id="file-upload"
//               />
//               <label htmlFor="file-upload" className="upload-btn" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
//                 {uploading ? '⏳ CHIFFREMENT...' : '📤 TÉLÉVERSER'}
//               </label>
//             </div>
//           </div>
          
//           {files.length === 0 ? (
//             <div className="empty-files">
//               <div className="empty-icon">📭</div>
//               <p className="empty-text">AUCUN FICHIER DANS CET ESPACE</p>
//               <p className="empty-text" style={{ fontSize: 10 }}>Cliquez sur "TÉLÉVERSER" pour ajouter vos premiers fichiers chiffrés</p>
//             </div>
//           ) : (
//             <div className="files-list">
//               {files.map(file => (
//                 <div key={file.id} className="file-item">
//                   <div className="file-info">
//                     <div className="file-icon">📄</div>
//                     <div className="file-details">
//                       <div className="file-name">{file.name}</div>
//                       <div className="file-meta">
//                         <span className="file-size">📦 {formatSize(file.size)}</span>
//                         <span className="file-date">📅 {new Date(file.createdAt).toLocaleDateString()}</span>
//                         <span className="file-type">🔐 AES-256-GCM</span>
//                       </div>
//                     </div>
//                   </div>
//                   <div className="file-actions">
//                     <button 
//                       className="file-btn download" 
//                       onClick={() => handleDownload(file)}
//                       disabled={downloading}
//                     >
//                       ⬇️ TÉLÉCHARGER
//                     </button>
//                     <button 
//                       className="file-btn" 
//                       onClick={() => handleShare(file)}
//                     >
//                       🔗 PARTAGER
//                     </button>
//                     <button 
//                       className="file-btn delete" 
//                       onClick={() => handleDelete(file)}
//                     >
//                       🗑️ SUPPRIMER
//                     </button>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>
//       </main>
//     </div>
//   );
// }