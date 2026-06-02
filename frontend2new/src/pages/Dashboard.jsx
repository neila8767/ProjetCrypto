import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  FileText,
  Share2,
  Search,
  Plus,
  Upload as UploadIcon,
  Download,
  MoreVertical,
  X,
  ArrowLeft,
  Trash2,
  PenSquare,
  Users,
  UserPlus,
  Menu,
  HardDrive,
  PieChart,
  LogOut,
  Settings,
  Bell,
  Star,
  Trash,
  Cloud,
  Shield,
  Clock
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import UploadService from '../services/uploadService';
import DownloadService from '../services/downloadService';
import ExtensionService from '../services/extensionService';
import FolderService from '../services/FolderService';
import JSZip from 'jszip';
import './dashboard.css';
const Dashboard = () => {
  const { user, logout } = useAuth();

  // États existants (aucune modification)
  const [folders, setFolders] = useState([]);
  const [sharedWithMe, setSharedWithMe] = useState([]);
  const [files, setFiles] = useState([]);
  const [sharedByMe, setSharedByMe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('myFiles');
  const [uploading, setUploading] = useState(false);
  const [waitingExtension, setWaitingExtension] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeMenu, setActiveMenu] = useState(null);
  const [activeMenuFolder, setActiveMenuFolder] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareFileId, setShareFileId] = useState(null);
  const [shareFileName, setShareFileName] = useState('');
  const [sharing, setSharing] = useState(false);
  const [decryptingKey, setDecryptingKey] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [currentFolderName, setCurrentFolderName] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  // NOUVEAUX ÉTATS
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageTotal] = useState(15 * 1024 * 1024 * 1024); // 15GB en bytes
  const [notification, setNotification] = useState(null);

  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  // =============================
  // CALCUL STORAGE (simulé depuis les fichiers)
  // =============================
  useEffect(() => {
    const totalSize = files.reduce((acc, file) => acc + (file.size || 0), 0);
    setStorageUsed(totalSize);
  }, [files]);

  // Fonction pour formater la taille
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Calcul du pourcentage d'utilisation
  const storagePercent = (storageUsed / storageTotal) * 100;

  // =============================
  // NOTIFICATION AUTO-DISPARITION
  // =============================
  useEffect(() => {
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
        setErrorMessage('');
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, errorMessage]);

  useEffect(() => {
    loadDashboard();
    loadSharedByMe(); // Charger les partages que j'ai faits
  }, []);

  // =============================
  // LOAD DATA
  // =============================
  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [foldersRes, sharedRes, filesRes] = await Promise.all([
        api.get('/folders', { params: { parent_id: currentFolderId } }),
        api.get('/shared-with-me'),
        api.get('/files', { params: { folder_id: currentFolderId } })
      ]);

      if (foldersRes.data.success) setFolders(foldersRes.data.data);
      if (sharedRes.data.success) setSharedWithMe(sharedRes.data.data);
      if (filesRes.data.success) setFiles(filesRes.data.data);

    } catch (err) {
      console.error(err);
      setErrorMessage("Erreur chargement du dossier");
    } finally {
      setLoading(false);
    }
  };

  // Charger les personnes avec qui j'ai partagé
  const loadSharedByMe = async () => {
    try {
      const response = await api.get('/shared-by-me-simple');
      if (response.data.success) {
        setSharedByMe(response.data.data);
      }
    } catch (err) {
      console.error("Erreur chargement partages:", err);
    }
  };

  // Recharger quand le dossier change
  useEffect(() => {
    loadDashboard();
  }, [currentFolderId]);

  // =============================
  // FOLDER NAVIGATION
  // =============================
  const openFolder = (folderId, folderName) => {
    setCurrentFolderId(folderId);
    setCurrentFolderName(folderName);
    setSearchTerm("");
    setActiveMenu(null);
    setActiveMenuFolder(null);
    setActiveTab('myFiles');
  };

  const goUp = () => {
    setCurrentFolderId(null);
    setCurrentFolderName("");
    setSearchTerm("");
    setActiveMenu(null);
    setActiveMenuFolder(null);
  };

  // =============================
  // FOLDER UPLOAD
  // =============================
  const handleFolderUpload = async () => {
    if (!window.showDirectoryPicker) {
      setErrorMessage("Navigateur non supporté");
      return;
    }

    try {
      const dirHandle = await window.showDirectoryPicker();
      const rootFolder = await FolderService.createFolder(dirHandle.name, currentFolderId);
      const rootFolderId = rootFolder.id;
      const files = [];

      async function walkDirectory(dirHandle, currentPath = '') {
        for await (const entry of dirHandle.values()) {
          const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            files.push({ file, relativePath: fullPath });
          } else {
            await walkDirectory(entry, fullPath);
          }
        }
      }

      await walkDirectory(dirHandle);

      const foldersMap = new Map();
      const fileItems = files.map(f => ({
        file: f.file,
        folderPath: f.relativePath.includes('/') ? f.relativePath.substring(0, f.relativePath.lastIndexOf('/')) : '__ROOT__'
      }));

      const uniquePaths = [...new Set(fileItems.map(f => f.folderPath).filter(p => p !== '__ROOT__'))];
      uniquePaths.sort((a, b) => a.split('/').length - b.split('/').length);

      for (const path of uniquePaths) {
        const parts = path.split('/');
        let parentId = rootFolderId;
        let currentPath = '';
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          currentPath += (i === 0 ? part : '/' + part);
          if (foldersMap.has(currentPath)) {
            parentId = foldersMap.get(currentPath);
          } else {
            const folder = await FolderService.createFolder(part, parentId);
            foldersMap.set(currentPath, folder.id);
            parentId = folder.id;
          }
        }
      }

      setProgressMessage(`📤 Upload de ${fileItems.length} fichiers...`);
      setWaitingExtension(true);
      let uploaded = 0;
      for (const item of fileItems) {
        let targetFolderId = rootFolderId;
        if (item.folderPath !== '__ROOT__') {
          targetFolderId = foldersMap.get(item.folderPath);
        }
        
        const prepared = await UploadService.prepareFileUpload(item.file);
        
        const waitForUnlock = async () => {
          while (true) {
            const status = await window.myWallet?.isUnlocked();
            if (status?.unlocked) return;
            await new Promise(r => setTimeout(r, 800));
          }
        };
        await waitForUnlock();
        
        await UploadService.uploadPrepared(prepared, targetFolderId);
        uploaded++;
        setProgressMessage(`📤 Upload: ${uploaded}/${fileItems.length} fichiers`);
      }
      setWaitingExtension(false);
      setSuccessMessage(`✅ Dossier uploadé (${uploaded} fichiers)`);
      await loadDashboard();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setUploading(false);
      setProgressMessage("");
      setWaitingExtension(false);
    }
  };

  // =============================
  // DOWNLOAD FOLDER AS ZIP
  // =============================
  const handleDownloadFolder = async (folderId, folderName) => {
    try {
      setProgressMessage("📦 Récupération des fichiers...");
      const filesRes = await api.get("/files", { params: { folder_id: folderId } });
      const files = filesRes.data.data;
      if (files.length === 0) {
        alert("Le dossier est vide");
        return;
      }

      const zip = new JSZip();

      for (const file of files) {
        setProgressMessage(`🔓 Déchiffrement de ${file.filename}...`);
        const { decryptedBuffer } = await DownloadService.downloadFile(file.id, "personal");
        zip.file(file.filename, decryptedBuffer);
      }

      setProgressMessage("📦 Création de l'archive ZIP...");
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMessage(`Dossier "${folderName}" téléchargé avec succès`);
    } catch (err) {
      setErrorMessage(err.message || "Erreur lors du téléchargement");
    } finally {
      setProgressMessage("");
    }
  };

  // =============================
  // DELETE FOLDER
  // =============================
  const handleDeleteFolder = async (folderId) => {
    if (!window.confirm("Supprimer ce dossier et tout son contenu ?")) return;
    try {
      await api.delete(`/folders/${folderId}`);
      setSuccessMessage("Dossier supprimé");
      if (currentFolderId === folderId) goUp();
      else await loadDashboard();
    } catch (err) {
      setErrorMessage("Erreur suppression dossier");
    }
    setActiveMenuFolder(null);
  };

  // =============================
  // RENAME FOLDER
  // =============================
  const handleRenameFolder = async (folderId, oldName) => {
    const newName = prompt("Nouveau nom :", oldName);
    if (!newName) return;
    try {
      await api.put(`/folders/${folderId}`, { newName });
      setSuccessMessage("Dossier renommé");
      await loadDashboard();
    } catch (err) {
      setErrorMessage("Erreur rename dossier");
    }
    setActiveMenuFolder(null);
  };

  // =============================
  // UPLOAD FLOW FIXED
  // =============================
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      setErrorMessage('');
      setSuccessMessage('');
      setProgressMessage("📦 Préparation du fichier...");
      setWaitingExtension(false);

      const prepared = await UploadService.prepareFileUpload(file);

      setProgressMessage("🔑 Attente déverrouillage extension...");
      setWaitingExtension(true);

      const waitForUnlock = async () => {
        while (true) {
          const status = await window.myWallet.isUnlocked();
          if (status.unlocked) return;
          await new Promise(r => setTimeout(r, 800));
        }
      };

      await waitForUnlock();

      setWaitingExtension(false);
      setProgressMessage("📤 Upload en cours...");

      await UploadService.uploadPrepared(prepared, currentFolderId);

      setSuccessMessage(`✅ Upload réussi : ${file.name}`);
      setProgressMessage('');

      await loadDashboard();

    } catch (err) {
      setErrorMessage("❌ " + err.message);
      setProgressMessage('');
      setWaitingExtension(false);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  // =============================
  // DOWNLOAD
  // =============================
  const handleDownload = async (fileId, filename) => {
    try {
      await DownloadService.downloadAndSave(fileId, 'personal');
      setSuccessMessage(`📥 Téléchargement de "${filename}" démarré`);
    } catch (err) {
      setErrorMessage("❌ " + err.message);
    }
  };

  // =============================
  // DELETE FILE
  // =============================
  const handleDelete = async (fileId, fileName) => {
    if (window.confirm(`Supprimer "${fileName}" définitivement ?`)) {
      try {
        const response = await api.delete(`/files/${fileId}`);
        if (response.data.success) {
          setSuccessMessage(`✅ "${fileName}" supprimé`);
          await loadDashboard();
        } else {
          setErrorMessage("Erreur lors de la suppression");
        }
      } catch (err) {
        setErrorMessage("❌ " + err.message);
      }
      setActiveMenu(null);
    }
  };

  // =============================
  // RENAME FILE
  // =============================
  const handleRenameFile = async (fileId, oldName) => {
    const newName = prompt("Nouveau nom :", oldName);
    if (!newName) return;
    try {
      await api.put(`/files/${fileId}`, { newName });
      setSuccessMessage("Fichier renommé");
      await loadDashboard();
    } catch (err) {
      setErrorMessage("Erreur rename fichier");
    }
    setActiveMenu(null);
  };

  // =============================
  // PREVIEW FILE
  // =============================
  const handlePreview = async (fileId) => {
    try {
      setProgressMessage("🔐 Déchiffrement...");
      const result = await DownloadService.downloadFile(fileId, "personal");
      const blob = new Blob([result.decryptedBuffer]);
      const url = URL.createObjectURL(blob);
      setPreviewFile(result.filename);
      setPreviewUrl(url);
      setProgressMessage("");
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
  };

  // =============================
  // SHARE FILE VIA EMAIL
  // =============================
  const openShareModal = (fileId, fileName) => {
    setShareFileId(fileId);
    setShareFileName(fileName);
    setShareEmail('');
    setShowShareModal(true);
    setActiveMenu(null);
  };

  const handleShare = async () => {
    if (!shareEmail) {
        setErrorMessage("Veuillez entrer une adresse email");
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail)) {
        setErrorMessage("Email invalide");
        return;
    }

    setSharing(true);
    setErrorMessage('');
    setDecryptingKey(true);
    
    try {
        setProgressMessage("🔑 Récupération de la clé chiffrée...");
        const keyResponse = await api.get(`/files/${shareFileId}/encrypted-key`);
        
        if (!keyResponse.data.success) {
            throw new Error(keyResponse.data.message || "Impossible de récupérer la clé");
        }
        
        const encryptedAesKeyBase64 = keyResponse.data.encryptedKey;
        
        setProgressMessage("🔓 Déchiffrement et rechiffrement avec votre wallet...");
        
        if (!window.myWallet) {
            throw new Error("Extension SecureCloud non détectée");
        }
        
        const status = await window.myWallet.isUnlocked();
        if (!status.unlocked) {
            setProgressMessage("🔐 Veuillez déverrouiller votre wallet...");
            if (window.myWallet.openPopup) {
                await window.myWallet.openPopup();
            }
            let attempts = 0;
            while (attempts < 30) {
                const newStatus = await window.myWallet.isUnlocked();
                if (newStatus.unlocked) break;
                await new Promise(r => setTimeout(r, 1000));
                attempts++;
            }
        }
        
        const { decryptedKey, reencryptedKey } = await ExtensionService.getAESKeyBothVersions(
            encryptedAesKeyBase64,
            'personal'
        );
        
        setDecryptingKey(false);
        
        setProgressMessage("📤 Envoi du partage...");
        
        const decryptedKeyBase64 = btoa(String.fromCharCode(...decryptedKey));
        const reencryptedKeyBase64 = btoa(String.fromCharCode(...reencryptedKey));
        
        const response = await api.post('/sharefile', {
            fileId: shareFileId,
            recipientEmail: shareEmail,
            decryptedAesKey: decryptedKeyBase64,
            reencryptedAesKey: reencryptedKeyBase64
        });
        
        if (response.data.success) {
            setSuccessMessage(`✅ Fichier "${shareFileName}" partagé avec ${shareEmail}`);
            setShowShareModal(false);
            setShareEmail('');
            setShareFileId(null);
            setProgressMessage('');
            await loadSharedByMe(); // Rafraîchir la liste des partages
        } else {
            throw new Error(response.data.message || "Erreur lors du partage");
        }
        
    } catch (err) {
        console.error("Erreur partage:", err);
        setErrorMessage(err.message || err.response?.data?.message || "❌ Erreur lors du partage");
        setDecryptingKey(false);
    } finally {
        setSharing(false);
        setProgressMessage('');
    }
  };

  // =============================
// FILE MENU - STYLE CYBERPUNK
// =============================
const FileMenu = ({ fileId, fileName }) => (
  <div className="cyber-menu absolute right-0 mt-2 w-56 z-50">
   
    <button
      onClick={() => handleRenameFile(fileId, fileName)}
      className="cyber-menu-item"
    >
      <PenSquare className="menu-icon" size={16} />
      <span>Renommer</span>
      <span className="menu-shortcut">F2</span>
    </button>
    <button
      onClick={() => openShareModal(fileId, fileName)}
      className="cyber-menu-item"
    >
      <span className="menu-icon">🔗</span>
      <span>Partager</span>
      <span className="menu-shortcut">Ctrl+S</span>
    </button>
    <div className="cyber-menu-divider"></div>
    <button
      onClick={() => handleDelete(fileId, fileName)}
      className="cyber-menu-item danger"
    >
      <span className="menu-icon">🗑</span>
      <span>Supprimer</span>
      <span className="menu-shortcut">Del</span>
    </button>
  </div>
);

// =============================
// FOLDER MENU - STYLE CYBERPUNK
// =============================
const FolderMenu = ({ folder }) => (
  <div className="cyber-menu absolute right-0 mt-2 w-56 z-50">
    <button
      onClick={() => handleDownloadFolder(folder.id, folder.name)}
      className="cyber-menu-item"
    >
      <Download className="menu-icon" size={16} />
      <span>Télécharger ZIP</span>
      <span className="menu-shortcut">Ctrl+D</span>
    </button>
    <button
      onClick={() => handleRenameFolder(folder.id, folder.name)}
      className="cyber-menu-item"
    >
      <PenSquare className="menu-icon" size={16} />
      <span>Renommer</span>
      <span className="menu-shortcut">F2</span>
    </button>
    <div className="cyber-menu-divider"></div>
    <button
      onClick={() => handleDeleteFolder(folder.id)}
      className="cyber-menu-item danger"
    >
      <Trash2 className="menu-icon" size={16} />
      <span>Supprimer</span>
      <span className="menu-shortcut">Del</span>
    </button>
  </div>
);

// =============================
// NEW MENU - STYLE CYBERPUNK
// =============================
const NewMenu = () => (
  <div ref={menuRef} className="cyber-menu-new absolute right-0 mt-2 w-64 z-50">
    <div className="cyber-menu-header">
      <span>📁 NOUVEAU</span>
      <div className="cyber-glow"></div>
    </div>
    <button
      onClick={() => {
        setShowNewMenu(false);
        fileInputRef.current?.click();
      }}
      className="cyber-menu-item"
    >
      <UploadIcon className="menu-icon" size={18} />
      <div className="menu-content">
        <span>Upload fichier</span>
        <span className="menu-desc">Fichier individuel chiffré</span>
      </div>
    </button>
    <button
      onClick={() => {
        setShowNewMenu(false);
        handleFolderUpload();
      }}
      className="cyber-menu-item"
    >
      <Folder className="menu-icon" size={18} />
      <div className="menu-content">
        <span>Upload dossier</span>
        <span className="menu-desc">Dossier avec arborescence</span>
      </div>
    </button>
  </div>
);

// =============================
// SHARE MODAL - STYLE CYBERPUNK
// =============================
const ShareModal = () => (
  <div className="cyber-modal-overlay" onClick={() => setShowShareModal(false)}>
    <div className="cyber-modal" onClick={(e) => e.stopPropagation()}>
      <div className="cyber-modal-header">
        <div className="modal-header-glow"></div>
        <h2>🔗 PARTAGER UN FICHIER</h2>
        <button
          onClick={() => setShowShareModal(false)}
          className="cyber-modal-close"
        >
          <X size={18} />
        </button>
      </div>
      
      <div className="cyber-modal-body">
        <div className="share-file-info">
          <div className="info-label">FICHIER</div>
          <div className="info-value">{shareFileName}</div>
        </div>
        
        <div className="share-email-input">
          <label>
            <span>📧 DESTINATAIRE</span>
            <input
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="exemple@email.com"
              autoFocus
              disabled={sharing || decryptingKey}
            />
          </label>
        </div>
        
        {(decryptingKey || sharing) && (
          <div className="share-progress">
            <div className="cyber-spinner-small"></div>
            <span>{progressMessage}</span>
          </div>
        )}
      </div>
      
      <div className="cyber-modal-footer">
        <button
          onClick={() => setShowShareModal(false)}
          className="cyber-btn-secondary"
          disabled={sharing || decryptingKey}
        >
          ANNULER
        </button>
        <button
          onClick={handleShare}
          disabled={sharing || decryptingKey || !shareEmail}
          className="cyber-btn-primary"
        >
          {decryptingKey ? "🔓 DÉCHIFFREMENT..." : sharing ? "📤 ENVOI..." : "PARTAGER"}
        </button>
      </div>
    </div>
  </div>
);

// =============================
// RENDER SHARED WITH ME - STYLE CYBERPUNK
// =============================
const renderSharedWithMe = () => (
  <div className="section-cyber">
    <div className="section-header">
      <div className="section-title">
        <Share2 size={22} />
        <h2>Fichiers partagés avec moi</h2>
      </div>
      <div className="section-badge">{sharedWithMe.length} éléments</div>
    </div>
    
    {sharedWithMe.length === 0 ? (
      <div className="empty-state">
        <div className="empty-icon">📭</div>
        <p>Aucun fichier partagé avec vous</p>
        <span className="empty-hint">Les fichiers partagés apparaîtront ici</span>
      </div>
    ) : (
      <div className="cyber-table">
        <div className="cyber-table-header">
          <div>NOM</div>
          <div>PROPRIÉTAIRE</div>
          <div>TAILLE</div>
          <div></div>
        </div>
        {sharedWithMe.map(share => (
          <div key={share.filekey_id || share.id} className="cyber-table-row">
            <div className="row-name">
              <FileText size={18} />
              <span>{share.filename}</span>
            </div>
            <div className="row-owner">{share.owner_email}</div>
            <div className="row-size">{formatBytes(share.size)}</div>
            <div className="row-actions">
              <button
                onClick={() => handleDownload(share.file_id || share.fileId, share.filename)}
                className="cyber-icon-btn"
                title="Télécharger"
              >
                <Download size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// =============================
// RENDER SHARED BY ME - STYLE CYBERPUNK
// =============================
const renderSharedByMe = () => (
  <div className="section-cyber">
    <div className="section-header">
      <div className="section-title">
        <Users size={22} />
        <h2>Personnes avec qui j'ai partagé</h2>
      </div>
      <div className="section-badge">{sharedByMe.length} contacts</div>
    </div>
    
    {sharedByMe.length === 0 ? (
      <div className="empty-state">
        <div className="empty-icon">👥</div>
        <p>Vous n'avez encore partagé aucun fichier</p>
        <span className="empty-hint">Partagez un fichier pour commencer</span>
      </div>
    ) : (
      <div className="contacts-grid">
        {sharedByMe.map(share => (
          <div key={share.user_id} className="contact-card">
            <div className="contact-avatar">
              {share.email.charAt(0).toUpperCase()}
            </div>
            <div className="contact-info">
              <div className="contact-email">{share.email}</div>
              <div className="contact-stats">
                <span>📁 {share.files_count} fichier(s)</span>
                <span>📅 {new Date(share.last_share_date).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// =============================
// RENDER MY FILES - STYLE CYBERPUNK
// =============================
const renderMyFiles = () => (
  <>
    {/* FOLDERS SECTION */}
    {filteredFolders.length > 0 && (
      <div className="section-cyber">
        <div className="section-header">
          <div className="section-title">
            <Folder size={22} />
            <h2>Dossiers</h2>
          </div>
          <div className="section-badge">{filteredFolders.length} dossiers</div>
        </div>
        
        <div className="folders-grid">
          {filteredFolders.map(folder => (
            <div
              key={folder.id}
              className="folder-card-cyber"
              onDoubleClick={() => openFolder(folder.id, folder.name)}
            >
              <div className="folder-card-inner">
                <div className="folder-icon">
                  <Folder size={40} />
                </div>
                <div className="folder-info">
                  <h3>{folder.name}</h3>
                  <p>Dossier</p>
                </div>
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setActiveMenuFolder(activeMenuFolder === folder.id ? null : folder.id); 
                  }}
                  className="folder-menu-btn"
                >
                  <MoreVertical size={16} />
                </button>
              </div>
              {activeMenuFolder === folder.id && <FolderMenu folder={folder} />}
            </div>
          ))}
        </div>
      </div>
    )}

    {/* FILES SECTION */}
    <div className="section-cyber">
      <div className="section-header">
        <div className="section-title">
          <FileText size={22} />
          <h2>Mes fichiers</h2>
        </div>
        <div className="section-badge">{filteredFiles.length} fichiers</div>
      </div>
      
      {filteredFiles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <p>Aucun fichier dans ce dossier</p>
          <span className="empty-hint">Cliquez sur "Nouveau" pour ajouter des fichiers</span>
        </div>
      ) : (
        <div className="cyber-table">
          <div className="cyber-table-header">
            <div>NOM</div>
            <div>TAILLE</div>
            <div>DATE</div>
            <div></div>
          </div>
          {filteredFiles.map(file => (
            <div key={file.id} className="cyber-table-row">
              <div className="row-name">
                <FileText size={18} />
                <span>{file.filename}</span>
              </div>
              <div className="row-size">{formatBytes(file.size)}</div>
              <div className="row-date">{new Date(file.created_at).toLocaleDateString()}</div>
              <div className="row-actions">
                <button
                  onClick={() => handleDownload(file.id, file.filename)}
                  className="cyber-icon-btn"
                  title="Télécharger"
                >
                  <Download size={16} />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setActiveMenu(activeMenu === file.id ? null : file.id)}
                    className="cyber-icon-btn"
                    title="Plus d'options"
                  >
                    <MoreVertical size={16} />
                  </button>
                  {activeMenu === file.id && (
                    <FileMenu fileId={file.id} fileName={file.filename} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </>
);

  // =============================
  // FILTER
  // =============================
  const filteredFolders = folders.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFiles = files.filter(f =>
    f.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // =============================
  // CLICK OUTSIDE MENU
  // =============================
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowNewMenu(false);
        setActiveMenu(null);
        setActiveMenuFolder(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

   // =============================
  // UI AVEC SIDEBAR ET QUOTA
  // =============================
  return (
    <div className="dashboard-cyber">
      {/* Scanline effect */}
      <div className="scanline"></div>
      
      <div className="dashboard-container">
        {/* ========== SIDEBAR ========== */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu size={20} />
          </button>

          <div className="sidebar-logo">
            <div className="logo-hex-mini">
              <div className="hexagon"></div>
              <span className="logo-text-mini">DS</span>
            </div>
            {sidebarOpen && <span className="logo-name">DriveSECURE</span>}
          </div>

          <nav className="sidebar-nav">
            <button 
              className={`nav-item ${activeTab === 'myFiles' ? 'active' : ''}`}
              onClick={() => { setActiveTab('myFiles'); setSearchTerm(''); }}
            >
              <Folder size={20} />
              {sidebarOpen && <span>Mes fichiers</span>}
            </button>
            
            <button 
              className={`nav-item ${activeTab === 'sharedWithMe' ? 'active' : ''}`}
              onClick={() => { setActiveTab('sharedWithMe'); setSearchTerm(''); }}
            >
              <Share2 size={20} />
              {sidebarOpen && <span>Partagés avec moi</span>}
              {sidebarOpen && sharedWithMe.length > 0 && (
                <span className="nav-badge">{sharedWithMe.length}</span>
              )}
            </button>
            
            <button 
              className={`nav-item ${activeTab === 'sharedByMe' ? 'active' : ''}`}
              onClick={() => { setActiveTab('sharedByMe'); setSearchTerm(''); loadSharedByMe(); }}
            >
              <Users size={20} />
              {sidebarOpen && <span>J'ai partagé</span>}
            </button>

            <div className="nav-divider"></div>
            
            <button className="nav-item">
              <Star size={20} />
              {sidebarOpen && <span>Favoris</span>}
            </button>
            
            <button className="nav-item">
              <Trash size={20} />
              {sidebarOpen && <span>Corbeille</span>}
            </button>
          </nav>

          {/* Quota storage */}
          {sidebarOpen && (
            <div className="sidebar-storage">
              <div className="storage-info">
                <HardDrive size={16} />
                <span>Stockage</span>
              </div>
              <div className="storage-bar">
                <div 
                  className="storage-used" 
                  style={{ width: `${Math.min(storagePercent, 100)}%` }}
                ></div>
              </div>
              <div className="storage-stats">
                <span>{formatBytes(storageUsed)}</span>
                <span>/ {formatBytes(storageTotal)}</span>
              </div>
              <div className="storage-warning">
                <Shield size={12} />
                <span>Chiffrement AES-256</span>
              </div>
            </div>
          )}

        <div className="sidebar-footer">
  <button 
    className="nav-item" 
    onClick={() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      navigate('/login');
    }}
  >
    <LogOut size={20} />
    {sidebarOpen && <span>Déconnexion</span>}
  </button>
</div>

        </aside>

        {/* ========== MAIN CONTENT ========== */}
        <main className="main-content">
          {/* Header amélioré */}
          <header className="cyber-header">
            <div className="header-left">
              {!sidebarOpen && (
                <button 
                  className="mobile-menu-btn"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu size={24} />
                </button>
              )}
              <div className="header-breadcrumb">
                <span className="breadcrumb-root">DriveSECURE</span>
                {currentFolderName && activeTab === 'myFiles' && (
                  <>
                    <span className="breadcrumb-sep">/</span>
                    <span className="breadcrumb-current">{currentFolderName}</span>
                  </>
                )}
                {activeTab !== 'myFiles' && (
                  <>
                    <span className="breadcrumb-sep">/</span>
                    <span className="breadcrumb-current">
                      {activeTab === 'sharedWithMe' ? 'Partagés avec moi' : 'Mes partages'}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="header-right">
              <button className="header-icon">
                <Bell size={20} />
              </button>
              <button className="header-icon">
                <Settings size={20} />
              </button>
              <div className="user-info">
                <div className="user-avatar">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                {sidebarOpen && (
                  <div className="user-details">
                    <span className="user-email">{user?.email}</span>
                    <span className="user-plan">Pro - 15GB</span>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Contenu principal avec scroll */}
          <div className="content-scroll">
            {/* ACTIONS BAR */}
            <div className="actions-bar">
              <div className="search-wrapper">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Rechercher fichiers, dossiers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <button 
                className="btn-new"
                onClick={() => setShowNewMenu(!showNewMenu)}
              >
                <Plus size={18} />
                <span>Nouveau</span>
              </button>
              
              {showNewMenu && (
                <div className="new-menu-dropdown" ref={menuRef}>
                  <button onClick={() => { setShowNewMenu(false); fileInputRef.current?.click(); }}>
                    <UploadIcon size={16} /> Upload fichier
                  </button>
                  <button onClick={() => { setShowNewMenu(false); handleFolderUpload(); }}>
                    <Folder size={16} /> Upload dossier
                  </button>
                </div>
              )}
            </div>

            {/* Notifications */}
            {(successMessage || errorMessage) && (
              <div className={`notification ${successMessage ? 'success' : 'error'}`}>
                <span>{successMessage || errorMessage}</span>
                <button onClick={() => { setSuccessMessage(''); setErrorMessage(''); }}>×</button>
              </div>
            )}

            {/* Progress upload */}
            {uploading && !decryptingKey && !sharing && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div className="progress-fill animate"></div>
                </div>
                <p className="progress-text">{progressMessage || "⏳ Upload en cours..."}</p>
              </div>
            )}

           {/* STATS CARDS - Version simplifiée */}
{activeTab === 'myFiles' && (
  <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
    <div className="stat-card">
      <div className="stat-icon file">
        <FileText size={24} />
      </div>
      <div className="stat-info">
        <h3>{files.length}</h3>
        <p>Mes fichiers</p>
      </div>
    </div>
    
    <div className="stat-card">
      <div className="stat-icon share">
        <Share2 size={24} />
      </div>
      <div className="stat-info">
        <h3>{sharedWithMe.length}</h3>
        <p>Partagés avec moi</p>
      </div>
    </div>
    
    <div className="stat-card">
  <div className="stat-icon" style={{ 
    background: 'rgba(156, 84, 255, 0.2)', 
    color: '#9c54ff',
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <Users size={24} />
  </div>
  <div className="stat-info">
    <h3>{sharedByMe.length}</h3>
    <p>Personnes partagées</p>
  </div>
</div>
  </div>
)}

            {/* Contenu */}
            {loading ? (
              <div className="loading-container">
                <div className="terminal-loader">
                  <span className="loader-text">⧗ CHARGEMENT...</span>
                  <div className="loader-dots"></div>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'myFiles' && renderMyFiles()}
                {activeTab === 'sharedWithMe' && renderSharedWithMe()}
                {activeTab === 'sharedByMe' && renderSharedByMe()}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Modals (inchangés) */}
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
      {showShareModal && <ShareModal />}
      {previewUrl && (
        <div className="modal-overlay" onClick={closePreview}>
          <div className="modal-preview" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closePreview}>✕</button>
            <h3>{previewFile}</h3>
            <iframe src={previewUrl} title="Preview" />
          </div>
        </div>
      )}
      {waitingExtension && (
        <div className="modal-overlay">
          <div className="modal-waiting">
            <div className="spinner-cyber"></div>
            <h3>🔐 Extension SecureCloud</h3>
            <p>Déverrouillez votre wallet pour continuer</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;