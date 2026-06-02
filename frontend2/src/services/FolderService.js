import api from './api';

class FolderService {
  static async createFolder(name, parentId = null) {
    try {
      const response = await api.post('/folders', { name, parent_id: parentId });
      return response.data.data; // { id, name, ... }
    } catch (err) {
      console.error('Erreur création dossier:', err);
      throw new Error(err.response?.data?.message || 'Erreur création dossier');
    }
  }

  static async getOrCreateFolderByPath(pathParts, parentId = null) {
    // pathParts = ['dossier1', 'sous-dossier2', ...]
    let currentParentId = parentId;
    for (const part of pathParts) {
      // Vérifier si le dossier existe déjà (optionnel, mais on peut le faire)
      // Ici on crée systématiquement (on peut éviter les doublons avec une vérification)
      const newFolder = await this.createFolder(part, currentParentId);
      currentParentId = newFolder.id;
    }
    return currentParentId;
  }
}

export default FolderService;