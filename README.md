# ProjetCrypto - SecureCloud

A secure file storage and sharing application featuring end‑to‑end encryption.

## 🚀 Features

- **Authentication** – Sign in with email / password
- **File Management**
  - Encrypted file upload (client‑side AES)
  - Automatic decryption on download
  - In‑browser file preview
- **Secure Sharing**
  - Share files with other users via email
  - AES key decryption + re‑encryption with the recipient’s public key
  - Full wallet integration
- **Built‑in Wallet** – Browser extension for key management
- **Dashboard** – Search, statistics, and intuitive file listing

## 🛠️ Tech Stack

### Frontend
- **React** (Hooks: `useState`, `useEffect`, `useMemo`, `useCallback`)
- **Tailwind CSS** – styling
- **Lucide React** – icons

### Backend (API)
- REST API with endpoints:
  - `/folders` – list user folders
  - `/files/user` – list user files
  - `/shared-with-me` – shared files
  - `/sharefile` – share a file

### Cryptography
- **AES** (symmetric) – file encryption
- **RSA / public‑private key** – secure key exchange for sharing
- **Browser wallet** – manages keys and signing operations



How Cryptography Works
Upload
A random AES key is generated for the file.

The file is encrypted with this AES key.

The AES key is encrypted with the user’s public key.

The encrypted file + encrypted key are sent to the backend.

Download
The backend returns the encrypted file and the encrypted AES key.

The wallet extension decrypts the AES key using the user’s private key.

The file is decrypted client‑side.

Sharing
The owner’s wallet decrypts the AES key using their private key.

The AES key is re‑encrypted with the recipient’s public key.

The backend stores this re‑encrypted key for the recipient.
### Steps
