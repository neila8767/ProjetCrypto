import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback
} from "react";

import {
  Folder,
  FileText,
  Share2,
  Search,
  Plus,
  Upload as UploadIcon,
  Download,
  MoreVertical,
  ArrowLeft,
  Trash2,
  PenSquare
} from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import api from "../services/api";
import Layout from "../components/layout/Layout";
import UploadService from "../services/uploadService";
import DownloadService from "../services/downloadService";
import FolderService from "../services/FolderService";
import JSZip from 'jszip';
const Dashboard = () => {
  const { user } = useAuth();

  // Navigation
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [currentFolderName, setCurrentFolderName] = useState("");

  // Données
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [activeMenuFile, setActiveMenuFile] = useState(null);
  const [activeMenuFolder, setActiveMenuFolder] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [waitingExtension, setWaitingExtension] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  // Chargement contenu dossier courant
  const loadCurrentFolder = useCallback(async () => {
    setLoading(true);
    try {
      const foldersRes = await api.get("/folders", {
        params: { parent_id: currentFolderId }
      });
      if (foldersRes.data.success) setFolders(foldersRes.data.data);

      const filesRes = await api.get("/files", {
        params: { folder_id: currentFolderId }
      });
      if (filesRes.data.success) setFiles(filesRes.data.data);
    } catch (err) {
      setErrorMessage("Erreur chargement du dossier");
    } finally {
      setLoading(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    loadCurrentFolder();
  }, [loadCurrentFolder]);

  // Navigation
  const openFolder = (folderId, folderName) => {
    setCurrentFolderId(folderId);
    setCurrentFolderName(folderName);
    setSearchTerm("");
    setActiveMenuFile(null);
    setActiveMenuFolder(null);
  };

  const goUp = () => {
    setCurrentFolderId(null);
    setCurrentFolderName("");
    setSearchTerm("");
    setActiveMenuFile(null);
    setActiveMenuFolder(null);
  };

  // Filtrage
  const filteredFolders = useMemo(() => {
    return folders.filter(f =>
      f.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [folders, searchTerm]);

  const filteredFiles = useMemo(() => {
    return files.filter(f =>
      f.filename.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [files, searchTerm]);

  // Upload fichier
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      setErrorMessage("");
      setSuccessMessage("");
      setProgressMessage("📦 Préparation...");
      setWaitingExtension(true);

      const prepared = await UploadService.prepareFileUpload(file);
      setProgressMessage("📤 Upload en cours...");
      await UploadService.uploadPrepared(prepared, currentFolderId);

      setSuccessMessage(`Upload réussi: ${file.name}`);
      await loadCurrentFolder();
    } catch (err) {
      setErrorMessage(err.message || "Erreur upload");
    } finally {
      setUploading(false);
      setWaitingExtension(false);
      setProgressMessage("");
      event.target.value = "";
    }
  };

  // Upload dossier
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
        await UploadService.uploadPrepared(prepared, targetFolderId);
        uploaded++;
        setProgressMessage(`📤 Upload: ${uploaded}/${fileItems.length} fichiers`);
      }
      setWaitingExtension(false);
      setSuccessMessage(`✅ Dossier uploadé (${uploaded} fichiers)`);
      await loadCurrentFolder();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setUploading(false);
      setProgressMessage("");
    }
  };

  // Télécharger un dossier (ZIP côté client)
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
  // Télécharger un fichier
  const handleDownloadFile = async (fileId) => {
    try {
      await DownloadService.downloadAndSave(fileId, "personal");
      setSuccessMessage("Téléchargement démarré");
    } catch (err) {
      setErrorMessage(err.message || "Erreur download");
    }
  };

  // Supprimer un fichier
  const handleDeleteFile = async (fileId) => {
    if (!window.confirm("Supprimer ce fichier ?")) return;
    try {
      await api.delete(`/files/${fileId}`);
      setSuccessMessage("Fichier supprimé");
      await loadCurrentFolder();
    } catch (err) {
      setErrorMessage("Erreur suppression");
    }
  };

  // Renommer un fichier
  const handleRenameFile = async (fileId, oldName) => {
    const newName = prompt("Nouveau nom :", oldName);
    if (!newName) return;
    try {
      await api.put(`/files/${fileId}`, { newName });
      setSuccessMessage("Fichier renommé");
      await loadCurrentFolder();
    } catch (err) {
      setErrorMessage("Erreur rename");
    }
  };

  // Supprimer un dossier
  const handleDeleteFolder = async (folderId) => {
    if (!window.confirm("Supprimer ce dossier et tout son contenu ?")) return;
    try {
      await api.delete(`/folders/${folderId}`);
      setSuccessMessage("Dossier supprimé");
      if (currentFolderId === folderId) goUp();
      else await loadCurrentFolder();
    } catch (err) {
      setErrorMessage("Erreur suppression dossier");
    }
  };

  // Renommer un dossier
  const handleRenameFolder = async (folderId, oldName) => {
    const newName = prompt("Nouveau nom :", oldName);
    if (!newName) return;
    try {
      await api.put(`/folders/${folderId}`, { newName });
      setSuccessMessage("Dossier renommé");
      await loadCurrentFolder();
    } catch (err) {
      setErrorMessage("Erreur rename dossier");
    }
  };

  // Aperçu fichier
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

  // Composant menu pour fichier
  const FileMenu = ({ file }) => (
    <div className="absolute right-0 mt-2 w-40 bg-white border rounded shadow-lg z-50">
      <button
        onClick={() => handleRenameFile(file.id, file.filename)}
        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
      >
        <PenSquare className="w-4 h-4 inline mr-2" /> Renommer
      </button>
      <button
        onClick={() => handleDeleteFile(file.id)}
        className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-500"
      >
        <Trash2 className="w-4 h-4 inline mr-2" /> Supprimer
      </button>
    </div>
  );

  // Composant menu pour dossier
  const FolderMenu = ({ folder }) => (
    <div className="absolute right-0 mt-2 w-40 bg-white border rounded shadow-lg z-50">
      <button
        onClick={() => handleDownloadFolder(folder.id, folder.name)}
        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
      >
        <Download className="w-4 h-4 inline mr-2" /> Télécharger
      </button>
      <button
        onClick={() => handleRenameFolder(folder.id, folder.name)}
        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
      >
        <PenSquare className="w-4 h-4 inline mr-2" /> Renommer
      </button>
      <button
        onClick={() => handleDeleteFolder(folder.id)}
        className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-500"
      >
        <Trash2 className="w-4 h-4 inline mr-2" /> Supprimer
      </button>
    </div>
  );

  // Menu Nouveau
  const NewMenu = () => (
    <div ref={menuRef} className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-50">
      <button
        onClick={() => { setShowNewMenu(false); fileInputRef.current?.click(); }}
        className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2"
      >
        <UploadIcon className="w-4 h-4" /> Upload fichier
      </button>
      <button
        onClick={() => { setShowNewMenu(false); handleFolderUpload(); }}
        className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2"
      >
        <Folder className="w-4 h-4" /> Upload dossier
      </button>
    </div>
  );

  // Fermeture des menus au clic extérieur
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowNewMenu(false);
        setActiveMenuFile(null);
        setActiveMenuFolder(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* En-tête */}
        <div className="flex flex-wrap justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            {currentFolderId !== null && (
              <button onClick={goUp} className="p-2 hover:bg-gray-100 rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-2xl font-bold">
              {currentFolderName ? `Dossier: ${currentFolderName}` : "Tableau de bord"}
            </h1>
          </div>
          <p className="text-gray-600">Bienvenue, {user?.email}</p>
          <div className="relative">
            <button
              onClick={() => setShowNewMenu(!showNewMenu)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Nouveau
            </button>
            {showNewMenu && <NewMenu />}
          </div>
        </div>

        {/* Input fichier caché */}
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} hidden />

        {/* Messages */}
        {successMessage && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {errorMessage}
          </div>
        )}
        {uploading && (
          <div className="mb-4 p-3 bg-blue-100 text-blue-700 rounded">
            {progressMessage || "Upload..."}
          </div>
        )}

        {/* Recherche */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Dossiers */}
        {filteredFolders.length > 0 && (
          <>
            <h2 className="text-lg font-bold mb-4">Dossiers</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              {filteredFolders.map(folder => (
                <div
                  key={folder.id}
                  className="border rounded-lg p-4 hover:shadow-md cursor-pointer"
                  onDoubleClick={() => openFolder(folder.id, folder.name)}
                >
                  <div className="flex justify-between items-start">
                    <Folder className="text-blue-500 w-8 h-8 mb-2" />
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveMenuFolder(activeMenuFolder === folder.id ? null : folder.id); }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {activeMenuFolder === folder.id && <FolderMenu folder={folder} />}
                    </div>
                  </div>
                  <p className="font-medium">{folder.name}</p>
                  <p className="text-xs text-gray-500">Dossier</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Fichiers */}
        <h2 className="text-lg font-bold mb-4">Fichiers</h2>
        {loading ? (
          <p>Chargement...</p>
        ) : filteredFiles.length === 0 ? (
          <p className="text-gray-500">Aucun fichier dans ce dossier</p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {filteredFiles.map(file => (
              <div key={file.id} className="flex flex-wrap justify-between items-center p-4">
                <div>
                  <p className="font-medium">{file.filename}</p>
                  <p className="text-xs text-gray-500">{file.size} bytes</p>
                </div>
                <div className="flex items-center gap-3 relative">
                  <button
                    onClick={() => handleDownloadFile(file.id)}
                    className="p-2 rounded hover:bg-gray-100"
                    title="Télécharger"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handlePreview(file.id)}
                    className="p-2 rounded hover:bg-gray-100"
                    title="Aperçu"
                  >
                    👁
                  </button>
                  <button
                    onClick={() => setActiveMenuFile(activeMenuFile === file.id ? null : file.id)}
                    className="p-2 rounded hover:bg-gray-100"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {activeMenuFile === file.id && <FileMenu file={file} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal d'aperçu */}
        {previewUrl && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]" onClick={closePreview}>
            <div className="bg-white p-4 rounded w-[80%] h-[80%] relative" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-bold mb-2">{previewFile}</h2>
              <iframe src={previewUrl} className="w-full h-full" />
              <button onClick={closePreview} className="absolute top-2 right-2 bg-white rounded-full p-1">❌</button>
            </div>
          </div>
        )}

        {/* Modal d'attente extension */}
        {waitingExtension && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
            <div className="bg-white p-6 rounded text-center w-80">
              <div className="animate-spin w-10 h-10 border-b-2 border-blue-600 mx-auto mb-4" />
              <p className="font-bold">Déverrouillez votre wallet</p>
              <p className="text-sm text-gray-500 mt-2">La popup SecureCloud va s'ouvrir...</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;