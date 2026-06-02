// Constantes globales pour l'application

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const STORAGE_QUOTA = {
  DEFAULT: 1073741824, // 1 Go
  FREE: 1073741824,    // 1 Go
  PREMIUM: 5368709120, // 5 Go
};

export const FILE_STATUS = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  ERROR: 'error',
};

export const FOLDER_ROLES = {
  OWNER: 'owner',
  EDITOR: 'editor',
  VIEWER: 'viewer',
};

export const AUDIT_ACTIONS = {
  UPLOAD: 'UPLOAD',
  DOWNLOAD: 'DOWNLOAD',
  DELETE: 'DELETE',
  SHARE: 'SHARE',
  CREATE_FOLDER: 'CREATE_FOLDER',
  DELETE_FOLDER: 'DELETE_FOLDER',
};

export const ENCRYPTION = {
  AES_GCM: 'AES-GCM',
  RSA_OAEP: 'RSA-OAEP',
  AES_KEY_SIZE: 256,
  RSA_KEY_SIZE: 2048,
};