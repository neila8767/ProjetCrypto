// create-wallet.js
function checkPasswordStrength(password) {
    const criteria = {
        length: password.length >= 12,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    updateCriteriaDisplay(criteria);
    let strength = Object.values(criteria).filter(v => v).length;
    const strengthBar = document.querySelector('.strength-bar');
    strengthBar.className = 'strength-bar';
    if (strength <= 2) strengthBar.classList.add('strength-weak');
    else if (strength <= 3) strengthBar.classList.add('strength-medium');
    else if (strength <= 4) strengthBar.classList.add('strength-strong');
    else strengthBar.classList.add('strength-very-strong');

    const isValid = Object.values(criteria).every(v => v);
    document.getElementById('passwordError').style.display = (!isValid && password.length > 0) ? 'block' : 'none';
    return isValid;
}

function updateCriteriaDisplay(criteria) {
    const elements = ['length', 'uppercase', 'lowercase', 'number', 'special'];
    elements.forEach(k => {
        const el = document.getElementById(`criteria-${k}`);
        if (criteria[k]) {
            el.classList.add('valid');
            el.querySelector('.criteria-icon').textContent = '✅';
        } else {
            el.classList.remove('valid');
            el.querySelector('.criteria-icon').textContent = '◻️';
        }
    });
}

function passwordsMatch() {
    const pwd = document.getElementById('password').value;
    const confirm = document.getElementById('confirmPassword').value;
    return pwd === confirm && pwd.length > 0;
}

function validateAndEnable() {
    const pwd = document.getElementById('password').value;
    const isValid = checkPasswordStrength(pwd) && passwordsMatch();
    document.getElementById('createWalletBtn').disabled = !isValid;
}

async function createWallet(password) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { action: 'createWallet', password: password },
            (response) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (response?.error) reject(new Error(response.error));
                else resolve(response);
            }
        );
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const pwdInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirmPassword');
    const createBtn = document.getElementById('createWalletBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const closeBtn = document.getElementById('closeBtn');

    pwdInput.addEventListener('input', validateAndEnable);
    confirmInput.addEventListener('input', validateAndEnable);

    createBtn.addEventListener('click', async () => {
        const password = pwdInput.value;
        const confirm = confirmInput.value;
        if (!checkPasswordStrength(password) || password !== confirm) {
            alert('Veuillez respecter tous les critères et la confirmation');
            return;
        }
        createBtn.disabled = true;
        createBtn.textContent = '⏳ Création...';
        try {
            await createWallet(password);
            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
        } catch (err) {
            alert('Erreur: ' + err.message);
        } finally {
            createBtn.disabled = false;
            createBtn.textContent = 'Créer le wallet';
        }
    });

    cancelBtn.addEventListener('click', () => {
        if (confirm('Annuler la création ?')) window.close();
    });

    closeBtn.addEventListener('click', () => {
        window.close();
    });
});