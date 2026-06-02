// popup.js - Adapté pour background.js avec RSA manuel et 2 comptes par défaut (personal, sharing)
// Support complet des CSR + export/import par fichier JSON

let currentState = 'noWallet';
let pendingRequest = null;

document.addEventListener('DOMContentLoaded', async () => {
    const vault = await chrome.storage.local.get('wallet');
    const isUnlocked = await checkUnlockStatus();

    if (!vault.wallet) {
        showView('noWallet');
    } else if (!isUnlocked) {
        showView('locked');
        await checkPendingRequests();
    } else {
        showView('unlocked');
        await loadAccounts();
        await checkPendingRequests();
    }

    // Écouter les messages du background (demandes de signature)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'PENDING_REQUEST') {
            console.log('📨 [POPUP] Demande de signature reçue:', message);
            pendingRequest = message;
            showSignRequest(message);
            sendResponse({ received: true });
        }
        return true;
    });

    // Écouter les messages de la page via content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SIGNATURE_RESPONSE') {
            console.log('✅ [POPUP] Signature envoyée avec succès');
            setTimeout(() => window.close(), 500);
            sendResponse({ received: true });
        }
        return true;
    });

    document.getElementById('createWalletBtn')?.addEventListener('click', () => {
        chrome.windows.create({
            url: 'create-wallet.html',
            type: 'popup',
            width: 550,
            height: 700
        });
        window.close();
    });

    document.getElementById('unlockBtn')?.addEventListener('click', unlockWalletHandler);
    document.getElementById('lockBtn')?.addEventListener('click', async () => {
        await sendToBackground('lock', {});
        showView('locked');
        pendingRequest = null;
    });

    // ==================== Bouton d'inscription CSR ====================
    const registrationBtn = document.getElementById('registrationBtn');
    if (registrationBtn) {
        registrationBtn.addEventListener('click', async () => {
            await handleCSRRegistration();
        });
    }

    const addAccountBtn = document.getElementById('addAccountBtn');
    if (addAccountBtn) {
        addAccountBtn.addEventListener('click', async () => {
            const name = prompt('Nom du nouveau compte :', 'Nouveau compte');
            if (!name) return;
            const typeChoice = prompt('Type de compte:\n1 - personal\n2 - sharing\n3 - custom', '3');
            let type = 'custom';
            if (typeChoice === '1') type = 'personal';
            else if (typeChoice === '2') type = 'sharing';
            const password = await promptPasswordForAction("Ajouter un compte");
            if (!password) return;
            try {
                const result = await sendToBackground('addAccount', { name, type, password });
                if (result && result.id) {
                    await loadAccounts();
                    alert(`✅ Compte "${name}" créé !`);
                } else {
                    alert('Erreur lors de la création');
                }
            } catch (err) {
                alert('Erreur: ' + err.message);
            }
        });
    }

    // ==================== Bouton d'import ====================
    const importAccountBtn = document.getElementById('importAccountBtn');
    if (importAccountBtn) {
        importAccountBtn.addEventListener('click', async () => {
            const isUnlocked = await checkUnlockStatus();
            if (!isUnlocked) {
                alert("Wallet verrouillé");
                return;
            }
            const password = await promptPasswordForAction("Importer un compte");
            if (!password) return;

            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal" style="max-width:500px;">
                    <h3>📥 Importer un compte</h3>
                    <p>Choisissez le fichier JSON exporté :</p>
                    <input type="file" id="importFile" accept=".json,.securecloud" style="margin: 10px 0;">
                    <div class="modal-actions">
                        <button id="cancelImportBtn" class="btn-secondary">Annuler</button>
                        <button id="confirmImportBtn" class="btn-primary">Importer</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            const fileInput = modal.querySelector('#importFile');
            const confirmBtn = modal.querySelector('#confirmImportBtn');
            const cancelBtn = modal.querySelector('#cancelImportBtn');
            const cleanup = () => modal.remove();

            confirmBtn.onclick = async () => {
                const file = fileInput.files[0];
                if (!file) { alert("Aucun fichier sélectionné"); return; }
                try {
                    const text = await file.text();
                    const accountData = JSON.parse(text);
                    const result = await sendToBackground('importAccount', { accountData, password });
                    if (result?.success) {
                        alert(`✅ Compte "${accountData.name}" importé`);
                        cleanup();
                        await loadAccounts();
                    } else {
                        throw new Error(result?.error || "Échec");
                    }
                } catch (err) {
                    alert("Erreur: " + err.message);
                }
            };
            cancelBtn.onclick = cleanup;
        });
    }

    const passwordInput = document.getElementById('unlockPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') unlockWalletHandler();
        });
    }
});

// ==================== Gestion CSR ====================
async function handleCSRRegistration() {
    console.log('🔵 [POPUP] handleCSRRegistration appelé');
    
    // Vérifier que le wallet est déverrouillé
    const isUnlocked = await checkUnlockStatus();
    if (!isUnlocked) {
        alert('❌ Veuillez d\'abord déverrouiller le wallet');
        return;
    }
    
    // Afficher un modal pour les informations d'inscription
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="max-width: 500px;">
            <h3>📝 Inscription DriveSECURE</h3>
            <p>Génération de Certificate Signing Requests (CSR)</p>
            
            <div style="margin: 20px 0;">
                <label style="display: block; margin-bottom: 8px; color: #00b4ff;">📧 Email</label>
                <input type="email" id="csrEmail" class="input-field" placeholder="exemple@domaine.com" style="width: 100%;">
            </div>
            
            <div class="modal-actions" style="display: flex; gap: 12px; margin-top: 20px;">
                <button id="cancelCsrBtn" class="btn-secondary">Annuler</button>
                <button id="confirmCsrBtn" class="btn-primary">Générer les CSR</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const emailInput = modal.querySelector('#csrEmail');
    const confirmBtn = modal.querySelector('#confirmCsrBtn');
    const cancelBtn = modal.querySelector('#cancelCsrBtn');
    
    const cleanup = () => modal.remove();
    
    confirmBtn.onclick = async () => {
        const email = emailInput.value.trim();
        
        if (!email) {
            alert('Veuillez entrer un email');
            return;
        }
        
        cleanup();
        
        // Afficher un indicateur de chargement
        const loadingDiv = showLoadingModal("Génération des CSR en cours...");
        
        try {
            // Appeler signRegistration - le background génère et signe directement
            const result = await sendToBackground('signRegistration', { email });
            
            if (result && result.success) {
                console.log('✅ CSR générés:', result);
                
                // Afficher les résultats
                showCSRResults(result.csrs, result.count);
                
                // Optionnel : envoyer au serveur
                const sendToServer = confirm(`✅ ${result.count} CSR générés avec succès!\n\nVoulez-vous les envoyer au serveur DriveSECURE ?`);
                if (sendToServer) {
                    await sendCSRSToServer(result.csrs, email);
                }
            } else if (result && result.error) {
                alert('❌ Erreur: ' + result.error);
            } else {
                alert('❌ Erreur lors de la génération des CSR');
            }
        } catch (err) {
            console.error('Erreur CSR:', err);
            alert('❌ Erreur: ' + err.message);
        } finally {
            if (loadingDiv) loadingDiv.remove();
        }
    };
    
    cancelBtn.onclick = cleanup;
    emailInput.focus();
}

function showLoadingModal(message) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="text-align: center;">
            <div class="spinner" style="width: 40px; height: 40px; border: 3px solid rgba(0,180,255,0.3); border-top-color: #00b4ff; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 15px;"></div>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function showCSRResults(csrs, count) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    const csrListHtml = csrs.map((csr, index) => `
        <div style="background: rgba(0,0,0,0.3); padding: 12px; margin: 10px 0; border-radius: 8px; border-left: 3px solid #00ff9d;">
            <strong>${escapeHtml(csr.certificationRequestInfo.walletAccount.name)}</strong> (${escapeHtml(csr.certificationRequestInfo.walletAccount.id)})
            <div style="font-size: 10px; color: #8b92a8; margin-top: 5px;">
                Signature: ${csr.signature.substring(0, 50)}...
            </div>
            <button class="copyCsrBtn" data-index="${index}" style="margin-top: 8px; background: transparent; border: 1px solid #00b4ff; border-radius: 4px; padding: 4px 8px; cursor: pointer;">📋 Copier CSR</button>
        </div>
    `).join('');
    
    modal.innerHTML = `
        <div class="modal" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <h3>✅ CSR Générés (${count})</h3>
            <p>Les Certificate Signing Requests ont été générés avec succès.</p>
            
            <div style="margin: 20px 0;">
                ${csrListHtml}
            </div>
            
            <div class="modal-actions" style="display: flex; gap: 12px;">
                <button id="closeCsrResultsBtn" class="btn-secondary">Fermer</button>
                <button id="copyAllCsrBtn" class="btn-primary">📋 Copier tous les CSR</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelectorAll('.copyCsrBtn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const index = parseInt(btn.dataset.index);
            const csr = csrs[index];
            const csrString = JSON.stringify(csr, null, 2);
            await navigator.clipboard.writeText(csrString);
            btn.textContent = '✓ Copié !';
            setTimeout(() => btn.textContent = '📋 Copier CSR', 2000);
        });
    });
    
    modal.querySelector('#copyAllCsrBtn').addEventListener('click', async () => {
        const allCsrsString = JSON.stringify(csrs, null, 2);
        await navigator.clipboard.writeText(allCsrsString);
        alert('✅ Tous les CSR copiés dans le presse-papier');
    });
    
    modal.querySelector('#closeCsrResultsBtn').onclick = () => modal.remove();
}

async function sendCSRSToServer(csrs, email) {
    const serverUrl = prompt('URL du serveur DriveSECURE:', 'https://api.drivesecure.com/register');
    if (!serverUrl) return;
    
    const loadingDiv = showLoadingModal("Envoi au serveur...");
    
    try {
        const response = await fetch(serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, csrs })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert('✅ CSR envoyés avec succès au serveur !');
            console.log('Réponse serveur:', result);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (err) {
        console.error('Erreur envoi:', err);
        alert('❌ Erreur lors de l\'envoi au serveur: ' + err.message);
    } finally {
        if (loadingDiv) loadingDiv.remove();
    }
}

// ==================== FONCTIONS EXISTANTES ====================
async function unlockWalletHandler() {
    const passwordInput = document.getElementById('unlockPassword');
    const password = passwordInput?.value;
    if (!password || !password.trim()) {
        alert('Veuillez entrer votre mot de passe');
        return;
    }
    const unlockBtn = document.getElementById('unlockBtn');
    if (unlockBtn) { unlockBtn.disabled = true; unlockBtn.textContent = '⏳ Déverrouillage...'; }
    try {
        const result = await sendToBackground('unlockWallet', { password: password.trim() });
        if (result && result.accounts && result.accounts.length > 0) {
            showView('unlocked');
            await loadAccounts();
            passwordInput.value = '';
            
            if (pendingRequest) {
                await handleSignRequest(pendingRequest, password);
            } else {
                await checkPendingRequestsAfterUnlock();
            }
        } else throw new Error('Aucun compte');
    } catch (err) {
        alert('❌ Mot de passe incorrect');
        passwordInput.value = '';
        passwordInput.focus();
    } finally {
        if (unlockBtn) { unlockBtn.disabled = false; unlockBtn.textContent = 'Déverrouiller'; }
    }
}

async function checkPendingRequests() {
    try {
        const response = await sendToBackground('getPendingRequests', {});
        if (response && response.requests && response.requests.length > 0) {
            pendingRequest = response.requests[0];
            showSignRequest(pendingRequest);
        }
    } catch (err) {
        console.error('Erreur vérification demandes:', err);
    }
}

async function checkPendingRequestsAfterUnlock() {
    try {
        const response = await sendToBackground('getPendingRequests', {});
        if (response && response.requests && response.requests.length > 0) {
            const request = response.requests[0];
            const password = await promptPasswordForAction("Signer le challenge");
            if (password) {
                await handleSignRequest(request, password);
            } else {
                await sendToBackground('cancelPendingRequest', { requestId: request.requestId });
            }
        }
    } catch (err) {
        console.error('Erreur vérification demandes après déverrouillage:', err);
    }
}

async function handleSignRequest(request, password) {
    if (!request) return;
    
    console.log('🔐 [POPUP] Signature de la demande:', request);
    showSignRequest(request, true);
    
    try {
        const result = await sendToBackground('unlockAndSign', {
            password: password,
            requestId: request.requestId
        });
        
        if (result && result.success) {
            console.log('✅ [POPUP] Signature réussie');
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'SIGNATURE_RESULT',
                        signature: result.signature,
                        requestId: request.requestId
                    }).catch(() => {});
                }
            });
            setTimeout(() => window.close(), 1000);
        } else if (result && result.error) {
            alert('Erreur: ' + result.error);
            showView('unlocked');
            await loadAccounts();
        }
    } catch (err) {
        console.error('❌ [POPUP] Erreur signature:', err);
        alert('Erreur lors de la signature: ' + err.message);
        showView('unlocked');
        await loadAccounts();
    }
}

function showSignRequest(request, isProcessing = false) {
    const { accountId, site, challenge } = request;
    
    let accountDisplayName = accountId || 'Inconnu';
    let accountIcon = '🔑';
    if (accountId === 'personal') {
        accountDisplayName = 'Espace personnel';
        accountIcon = '👤';
    } else if (accountId === 'sharing') {
        accountDisplayName = 'Espace de partage';
        accountIcon = '👥';
    }
    
    const signView = document.createElement('div');
    signView.id = 'signView';
    signView.className = 'sign-request-view';
    signView.innerHTML = `
        <div class="sign-request-container">
            <div class="sign-header">
                <div class="sign-icon">🔐</div>
                <h3>Demande de signature</h3>
                <p class="sign-site">${escapeHtml(site || 'DriveSECURE')}</p>
            </div>
            
            <div class="sign-account-info">
                <div class="account-badge">
                    <span class="account-icon">${accountIcon}</span>
                    <span class="account-name">Compte: ${escapeHtml(accountDisplayName)}</span>
                </div>
                <div class="account-algorithm">
                    <span class="algo-badge">RSA (SHA-256)</span>
                </div>
            </div>
            
            <div class="sign-challenge">
                <label>Challenge à signer :</label>
                <code class="challenge-code">${challenge ? escapeHtml(challenge.substring(0, 50)) + '...' : 'Aucun challenge'}</code>
            </div>
            
            ${!isProcessing ? `
                <div class="sign-password-field">
                    <label>Mot de passe local :</label>
                    <input type="password" id="signPassword" class="input-field" placeholder="Entrez votre mot de passe" autofocus>
                </div>
                
                <div class="sign-actions">
                    <button id="signCancelBtn" class="btn-secondary">Annuler</button>
                    <button id="signConfirmBtn" class="btn-primary">Signer</button>
                </div>
            ` : `
                <div class="sign-processing">
                    <div class="spinner"></div>
                    <p>Signature en cours...</p>
                </div>
            `}
        </div>
    `;
    
    document.querySelectorAll('#noWalletView, #lockedView, #unlockedView').forEach(el => {
        if (el) el.style.display = 'none';
    });
    
    const existingSignView = document.getElementById('signView');
    if (existingSignView) existingSignView.remove();
    document.body.appendChild(signView);
    
    if (!isProcessing) {
        const passwordInput = signView.querySelector('#signPassword');
        const confirmBtn = signView.querySelector('#signConfirmBtn');
        const cancelBtn = signView.querySelector('#signCancelBtn');
        
        if (passwordInput) passwordInput.focus();
        
        confirmBtn?.addEventListener('click', async () => {
            const password = passwordInput?.value;
            if (!password) {
                alert('Veuillez entrer votre mot de passe');
                return;
            }
            await handleSignRequest(request, password);
        });
        
        cancelBtn?.addEventListener('click', async () => {
            await sendToBackground('cancelPendingRequest', { requestId: request.requestId });
            pendingRequest = null;
            const isUnlocked = await checkUnlockStatus();
            if (isUnlocked) {
                showView('unlocked');
                await loadAccounts();
            } else {
                showView('locked');
            }
        });
    }
    
    if (!document.getElementById('signatureStyles')) {
        const style = document.createElement('style');
        style.id = 'signatureStyles';
        style.textContent = `
            .sign-request-view {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: #0a0c12;
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .sign-request-container {
                background: rgba(20, 25, 35, 0.95);
                backdrop-filter: blur(10px);
                border: 1px solid #00b4ff;
                border-radius: 16px;
                padding: 24px;
                max-width: 450px;
                width: 100%;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            }
            .sign-header {
                text-align: center;
                margin-bottom: 24px;
            }
            .sign-icon {
                font-size: 48px;
                margin-bottom: 12px;
            }
            .sign-header h3 {
                color: #00b4ff;
                margin: 0 0 8px 0;
                font-family: monospace;
            }
            .sign-site {
                color: #8b92a8;
                font-size: 12px;
                margin: 0;
            }
            .sign-account-info {
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .account-badge {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .account-icon {
                font-size: 20px;
            }
            .account-name {
                color: #e6e9f0;
                font-family: monospace;
            }
            .account-algorithm {
                display: flex;
                align-items: center;
            }
            .algo-badge {
                background: rgba(0, 180, 255, 0.2);
                border: 1px solid #00b4ff;
                border-radius: 20px;
                padding: 4px 12px;
                font-size: 10px;
                font-family: monospace;
                color: #00b4ff;
            }
            .sign-challenge {
                margin-bottom: 20px;
            }
            .sign-challenge label {
                display: block;
                color: #00b4ff;
                font-size: 11px;
                margin-bottom: 8px;
                text-transform: uppercase;
            }
            .challenge-code {
                display: block;
                background: rgba(0, 0, 0, 0.5);
                padding: 10px;
                border-radius: 6px;
                font-family: monospace;
                font-size: 11px;
                color: #00ffea;
                word-break: break-all;
            }
            .sign-password-field {
                margin-bottom: 20px;
            }
            .sign-password-field label {
                display: block;
                color: #00b4ff;
                font-size: 11px;
                margin-bottom: 8px;
            }
            .input-field {
                width: 100%;
                padding: 12px;
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid #00b4ff;
                border-radius: 8px;
                color: #e6e9f0;
                font-family: monospace;
            }
            .sign-actions {
                display: flex;
                gap: 12px;
            }
            .btn-primary, .btn-secondary {
                flex: 1;
                padding: 12px;
                border: none;
                border-radius: 8px;
                font-family: monospace;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s;
            }
            .btn-primary {
                background: linear-gradient(135deg, #00b4ff, #0088cc);
                color: #0a0c12;
            }
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(0, 180, 255, 0.3);
            }
            .btn-secondary {
                background: transparent;
                border: 1px solid #00b4ff;
                color: #00b4ff;
            }
            .btn-secondary:hover {
                background: rgba(0, 180, 255, 0.1);
            }
            .sign-processing {
                text-align: center;
                padding: 20px;
            }
            .spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(0, 180, 255, 0.3);
                border-top-color: #00b4ff;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin: 0 auto 15px;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(5px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
            }
            .modal {
                background: #141923;
                border: 1px solid #00b4ff;
                border-radius: 16px;
                padding: 24px;
                max-width: 90%;
                max-height: 80vh;
                overflow-y: auto;
            }
            .btn-outline {
                background: transparent;
                border: 1px solid #00b4ff;
                border-radius: 6px;
                padding: 6px 12px;
                color: #00b4ff;
                cursor: pointer;
            }
            .sign-progress {
                font-size: 11px;
                color: #00ff9d;
                margin-top: 5px;
            }
        `;
        document.head.appendChild(style);
    }
}

function showView(viewName) {
    const signView = document.getElementById('signView');
    if (signView) signView.remove();
    
    ['noWallet', 'locked', 'unlocked'].forEach(v => {
        const el = document.getElementById(`${v}View`);
        if (el) el.style.display = 'none';
    });
    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) targetView.style.display = 'block';
}

async function checkUnlockStatus() {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'isUnlocked' }, r => resolve(r?.unlocked || false));
    });
}

async function loadAccounts() {
    try {
        const accounts = await sendToBackground('getAllAccounts', {});
        const active = await sendToBackground('getActiveAccount', {});
        
        document.getElementById('accountsCount').textContent = accounts.length;
        document.getElementById('keysCount').textContent = accounts.length;
        
        const container = document.getElementById('accountsList');
        if (!container) return;
        
        if (accounts.length === 0) {
            container.innerHTML = '<div class="account-card">Aucun compte</div>';
            return;
        }
        
        container.innerHTML = accounts.map(acc => {
            let displayIcon = acc.icon || '🔑';
            let displayType = '';
            let algorithmBadge = '<span class="algo-badge-oaep">RSA (chiffrement+signature)</span>';
            
            if (acc.type === 'personal') {
                displayType = '👤 Personnel';
                displayIcon = '👤';
            } else if (acc.type === 'sharing') {
                displayType = '👥 Partage';
                displayIcon = '👥';
            } else {
                displayType = '📁 Personnalisé';
            }
            
            return `
                <div class="account-card ${active?.id === acc.id ? 'active' : ''}" data-id="${acc.id}" data-type="${acc.type}">
                    <div class="account-info">
                        <div class="account-name">
                            <span class="account-icon-display">${escapeHtml(displayIcon)}</span>
                            <span class="account-name-text">${escapeHtml(acc.name)}</span>
                            ${algorithmBadge}
                        </div>
                        <div class="account-type">${escapeHtml(displayType)}</div>
                    </div>
                    <div class="account-actions">
                        <button class="account-action-btn" data-id="${acc.id}" data-publickey="${escapeHtml(acc.publicKey)}" title="Copier la clé publique">📋</button>
                        <button class="account-sign-btn" data-id="${acc.id}" data-type="${acc.type}" title="Signer un message avec ce compte">🔏</button>
                    </div>
                </div>
            `;
        }).join('');
        
        if (!document.getElementById('accountListStyles')) {
            const style = document.createElement('style');
            style.id = 'accountListStyles';
            style.textContent = `
                .account-name {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .algo-badge-oaep {
                    font-size: 9px;
                    padding: 2px 6px;
                    border-radius: 12px;
                    background: rgba(0, 255, 157, 0.2);
                    border: 1px solid #00ff9d;
                    color: #00ff9d;
                    font-family: monospace;
                }
                .account-actions {
                    display: flex;
                    gap: 8px;
                }
                .account-sign-btn {
                    background: transparent;
                    border: 1px solid #ffa502;
                    border-radius: 6px;
                    padding: 4px 8px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                .account-sign-btn:hover {
                    background: rgba(255, 165, 2, 0.2);
                    transform: scale(1.05);
                }
                .account-action-btn {
                    background: transparent;
                    border: 1px solid #00b4ff;
                    border-radius: 6px;
                    padding: 4px 8px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                .account-action-btn:hover {
                    background: rgba(0, 180, 255, 0.2);
                    transform: scale(1.05);
                }
                .account-card.active {
                    border: 2px solid #00ff9d;
                    background: rgba(0, 255, 157, 0.1);
                }
            `;
            document.head.appendChild(style);
        }

        document.querySelectorAll('.account-card').forEach(card => {
            card.addEventListener('dblclick', async (e) => {
                e.stopPropagation();
                const accountId = card.dataset.id;
                const account = accounts.find(a => a.id === accountId);
                if (account) await showAccountDetails(account);
            });
            
            card.addEventListener('click', async (e) => {
                if (e.target.tagName === 'BUTTON') return;
                const accountId = card.dataset.id;
                try {
                    await sendToBackground('switchAccount', { accountId });
                    await loadAccounts();
                } catch (err) {
                    console.error('Erreur changement compte:', err);
                }
            });
        });
        
        document.querySelectorAll('.account-action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const publicKey = btn.dataset.publickey;
                if (publicKey) {
                    await navigator.clipboard.writeText(publicKey);
                    btn.textContent = '✓';
                    setTimeout(() => btn.textContent = '📋', 2000);
                }
            });
        });
        
        document.querySelectorAll('.account-sign-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const accountId = btn.dataset.id;
                const challenge = prompt('Message / challenge à signer :');
                if (!challenge) return;
                
                const password = await promptPasswordForAction("Signer le message");
                if (!password) return;
                
                try {
                    const requestId = Date.now().toString();
                    const result = await sendToBackground('unlockAndSign', {
                        password: password,
                        requestId: requestId,
                        payload: {
                            accountId: accountId,
                            challenge: challenge,
                            site: 'Extension (manuel)'
                        }
                    });
                    
                    if (result && result.success) {
                        alert(`✅ Signature réussie !\n\nSignature (base64) :\n${result.signature.substring(0, 100)}...`);
                        await navigator.clipboard.writeText(result.signature);
                        alert('Signature complète copiée dans le presse-papier !');
                    } else if (result && result.error) {
                        alert('Erreur: ' + result.error);
                    }
                } catch (err) {
                    alert('Erreur: ' + err.message);
                }
            });
        });
    } catch (err) {
        console.error('Erreur chargement comptes:', err);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function sendToBackground(action, payload) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action, payload }, response => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (response?.error) reject(new Error(response.error));
            else resolve(response);
        });
    });
}

async function showAccountDetails(account) {
    const password = await promptPasswordForAction("Afficher les détails du compte");
    if (!password) return;
    try {
        const details = await sendToBackground('getAccountDetails', { accountId: account.id, password });
        showDetailsModal(account, details);
    } catch (err) {
        alert('Mot de passe incorrect ou erreur: ' + err.message);
    }
}

function promptPasswordForAction(action) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="max-width: 400px;">
                <h3>🔐 ${escapeHtml(action)}</h3>
                <p>Veuillez confirmer votre mot de passe.</p>
                <input type="password" id="confirmPassword" class="input-field" placeholder="Mot de passe" style="margin: 15px 0;">
                <div class="modal-actions">
                    <button id="cancelModalBtn" class="btn-secondary">Annuler</button>
                    <button id="confirmModalBtn" class="btn-primary">Confirmer</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const input = modal.querySelector('#confirmPassword');
        const confirmBtn = modal.querySelector('#confirmModalBtn');
        const cancelBtn = modal.querySelector('#cancelModalBtn');
        const cleanup = () => modal.remove();
        confirmBtn.onclick = () => { const pwd = input.value; cleanup(); resolve(pwd); };
        cancelBtn.onclick = () => { cleanup(); resolve(null); };
        input.focus();
        input.onkeypress = (e) => { if (e.key === 'Enter') confirmBtn.click(); };
    });
}

// ==================== MODALE DÉTAILS AVEC EXPORT FICHIER ====================
function showDetailsModal(account, details) {
    let publicKeyDisplay = details.publicKey;
    try {
        const publicKeyObj = JSON.parse(details.publicKey);
        publicKeyDisplay = JSON.stringify(publicKeyObj, null, 2);
    } catch (e) {}
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <h3>🔑 Détails du compte</h3>
            <p><strong>${escapeHtml(account.icon)} ${escapeHtml(account.name)}</strong> (${escapeHtml(account.type)})</p>
            <p style="font-size: 11px; color: #00b4ff;">RSA (chiffrement et signature)</p>
            <div style="margin: 20px 0;">
                <label style="display: block; margin-bottom: 8px; color: #00ff9d;">📋 Clé publique</label>
                <div style="background: rgba(0,0,0,0.5); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; word-break: break-all; white-space: pre-wrap;">${escapeHtml(publicKeyDisplay)}</div>
                <button id="copyPublicKeyBtn" class="btn-outline" style="margin-top: 8px;">📋 Copier</button>
            </div>
            <div style="margin: 20px 0;">
                <label style="display: block; margin-bottom: 8px; color: #ffa502;">🔒 Clé privée (SENSIBLE)</label>
                <div style="background: rgba(0,0,0,0.5); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; word-break: break-all;">
                    <span id="privateKeyDisplay">●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●</span>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button id="togglePrivateKeyBtn" class="btn-secondary">👁️ Afficher</button>
                    <button id="copyPrivateKeyBtn" class="btn-outline" style="opacity: 0.5;" disabled>📋 Copier (afficher d'abord)</button>
                </div>
            </div>
            <!-- Export fichier -->
            <div style="margin: 20px 0; text-align: center;">
                <button id="exportFileBtn" class="btn-outline">💾 Exporter le compte en fichier</button>
            </div>
            <div style="background: rgba(255,71,87,0.1); border-left: 3px solid #ff4757; padding: 12px; margin: 16px 0; border-radius: 4px;">
                ⚠️ <strong>ATTENTION :</strong> Ne partagez jamais votre clé privée.
            </div>
            <div class="modal-actions"><button id="closeModalBtn" class="btn-secondary">Fermer</button></div>
        </div>
    `;
    document.body.appendChild(modal);

    const privateKeySpan = modal.querySelector('#privateKeyDisplay');
    const toggleBtn = modal.querySelector('#togglePrivateKeyBtn');
    const copyPrivateBtn = modal.querySelector('#copyPrivateKeyBtn');
    const copyPublicBtn = modal.querySelector('#copyPublicKeyBtn');
    const exportFileBtn = modal.querySelector('#exportFileBtn');
    let visible = false;

    toggleBtn.onclick = () => {
        visible = !visible;
        if (visible) {
            privateKeySpan.textContent = details.privateKey;
            toggleBtn.innerHTML = '🙈 Masquer';
            copyPrivateBtn.style.opacity = '1';
            copyPrivateBtn.disabled = false;
        } else {
            privateKeySpan.textContent = '●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●';
            toggleBtn.innerHTML = '👁️ Afficher';
            copyPrivateBtn.style.opacity = '0.5';
            copyPrivateBtn.disabled = true;
        }
    };
    
    copyPublicBtn.onclick = async () => {
        await navigator.clipboard.writeText(details.publicKey);
        copyPublicBtn.textContent = '✓ Copié !';
        setTimeout(() => copyPublicBtn.textContent = '📋 Copier', 2000);
    };
    
    copyPrivateBtn.onclick = async () => {
        if (!visible) {
            alert('Veuillez d\'abord afficher la clé privée');
            return;
        }
        await navigator.clipboard.writeText(details.privateKey);
        copyPrivateBtn.textContent = '✓ Copié !';
        setTimeout(() => copyPrivateBtn.textContent = '📋 Copier', 2000);
    };
    
    exportFileBtn.onclick = async () => {
        const password = await promptPasswordForAction("Exporter le compte (mot de passe)");
        if (!password) return;
        try {
            const result = await sendToBackground('exportAccount', { accountId: account.id, password });
            if (result.success) {
                const jsonStr = JSON.stringify(result.data, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.download = `securecloud_${account.name}.json`;
                a.href = url;
                a.click();
                URL.revokeObjectURL(url);
                alert(`✅ Fichier exporté : securecloud_${account.name}.json`);
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            alert("Erreur export: " + err.message);
        }
    };
    
    modal.querySelector('#closeModalBtn').onclick = () => modal.remove();
}