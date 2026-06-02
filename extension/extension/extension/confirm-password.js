// confirm-password.js
document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('password');
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const errorMsg = document.getElementById('errorMsg');
    
    const urlParams = new URLSearchParams(window.location.search);
    const accountName = urlParams.get('name');
    const accountType = urlParams.get('type');
    
    function showError(message) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
        setTimeout(() => {
            errorMsg.style.display = 'none';
        }, 3000);
    }
    
    async function confirmAddAccount() {
        const password = passwordInput.value;
        
        if (!password) {
            showError('Veuillez entrer votre mot de passe');
            return;
        }
        
        confirmBtn.disabled = true;
        confirmBtn.textContent = '⏳ Vérification...';
        
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'confirmAddAccount',
                payload: {
                    password: password,
                    name: accountName,
                    type: accountType
                }
            });
            
            if (response && response.error) {
                showError('Mot de passe incorrect');
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirmer';
                passwordInput.value = '';
                passwordInput.focus();
            } else if (response && response.success) {
                window.close();
            }
        } catch (error) {
            console.error('Erreur:', error);
            showError('Erreur: ' + error.message);
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirmer';
        }
    }
    
    confirmBtn.addEventListener('click', confirmAddAccount);
    cancelBtn.addEventListener('click', () => {
        window.close();
    });
    
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            confirmAddAccount();
        }
    });
});