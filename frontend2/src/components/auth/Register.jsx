
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Register.css';
import Header from '../../components/Header'; 
function checkPassword(p) {
  return {
    length: p.length >= 12,
    upper: /[A-Z]/.test(p),
    lower: /[a-z]/.test(p),
    number: /[0-9]/.test(p),
    special: /[!@#$%^&*]/.test(p),
  };
}

function getStrength(checks) {
  const n = Object.values(checks).filter(Boolean).length;
  if (n <= 2) return 'weak';
  if (n <= 4) return 'medium';
  return 'strong';
}

const REQS = [
  { key: 'length', label: '12 CHARS MIN' },
  { key: 'upper', label: 'UPPERCASE [A-Z]' },
  { key: 'lower', label: 'LOWERCASE [a-z]' },
  { key: 'number', label: 'DIGIT [0-9]' },
  { key: 'special', label: 'SPECIAL [!@#$%^&*]' },
];

export default function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [step, setStep] = useState(1);
  const [showReqs, setShowReqs] = useState(false);
  
  // État simple pour l'extension
  const [extensionReady, setExtensionReady] = useState(false);

  const checks = checkPassword(form.password);
  const strength = form.password ? getStrength(checks) : null;
  const allMet = Object.values(checks).every(Boolean);

  const strengthLabel = {
    weak: 'WEAK',
    medium: 'MEDIUM',
    strong: 'STRONG'
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  // Vérifier simplement si l'extension est présente
  React.useEffect(() => {
    const checkExtension = async () => {
      let attempts = 0;
      while (!window.myWallet && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      setExtensionReady(!!window.myWallet);
    };
    checkExtension();
  }, []);
// ====================== INSCRIPTION ======================// ====================== INSCRIPTION ======================
const handleRegister = async (e) => {
  e.preventDefault();

  if (!form.email || !form.password || form.password !== form.confirm) {
    setError('ALL_FIELDS_REQUIRED_OR_MISMATCH');
    return;
  }
  if (!allMet) {
    setError('PASSWORD_TOO_WEAK');
    return;
  }
  
  // Vérifier que l'extension existe
  if (!window.myWallet) {
    setError('SECURECLOUD_EXTENSION_NOT_FOUND');
    return;
  }

  setLoading(true);
  setError('');
  setStep(2);

  try {
    // 🔑 ÉTAPE 1 : Vérifier si le wallet est déverrouillé
    console.log('🔵 [REGISTER] Vérification du statut du wallet...');
    const unlockStatus = await window.myWallet.isUnlocked();
    console.log('🔵 [REGISTER] Statut wallet:', unlockStatus);
    
    let isUnlocked = false;
    if (typeof unlockStatus === 'boolean') {
      isUnlocked = unlockStatus;
    } else if (unlockStatus && typeof unlockStatus === 'object') {
      isUnlocked = unlockStatus.unlocked === true;
    }
    
    // Si le wallet n'est pas déverrouillé, demander à l'utilisateur de le faire
    if (!isUnlocked) {
      console.log('🔵 [REGISTER] Wallet verrouillé, ouverture de la popup...');
      setError('Veuillez déverrouiller votre wallet SecureCloud');
      
      // Ouvrir la popup pour déverrouillage
      if (window.myWallet.openPopup) {
        await window.myWallet.openPopup();
      } else {
        window.open(`chrome-extension://${chrome.runtime.id}/popup.html`, '_blank');
      }
      
      setLoading(false);
      setStep(1);
      return;
    }
    
    console.log('✅ [REGISTER] Wallet déverrouillé, génération des CSR...');
    
    // Générer un requestId unique
    const requestId = Date.now().toString() + '_' + Math.random().toString(36).substring(2);
    
    // ÉTAPE 2 : Appeler signRegistration
    const signResult = await window.myWallet.send('signRegistration', {
      email: form.email,
      requestId: requestId
    });

    console.log('📦 [REGISTER] Résultat signRegistration complet:', JSON.stringify(signResult, null, 2));
    console.log('📦 [REGISTER] signResult.success:', signResult?.success);
    console.log('📦 [REGISTER] signResult.count:', signResult?.count);
    console.log('📦 [REGISTER] signResult.csrs length:', signResult?.csrs?.length);

    if (signResult?.error) {
      console.error('❌ [REGISTER] Erreur dans signResult:', signResult.error);
      throw new Error(signResult.error);
    }

    if (!signResult?.csrs || signResult.csrs.length === 0) {
      console.error('❌ [REGISTER] Aucun CSR dans signResult');
      throw new Error('Aucun CSR généré par SecureCloud');
    }

    // Afficher le premier CSR en détail
    console.log('📦 [REGISTER] Premier CSR détaillé:', JSON.stringify(signResult.csrs[0], null, 2));
    console.log('📦 [REGISTER] Structure du CSR:');
    console.log('  - certificationRequestInfo:', signResult.csrs[0].certificationRequestInfo ? '✅' : '❌');
    console.log('  - signature:', signResult.csrs[0].signature ? '✅ (' + signResult.csrs[0].signature.substring(0, 50) + '...)' : '❌');
    console.log('  - accountId:', signResult.csrs[0].accountId || '❌');
    console.log('  - publicKey:', signResult.csrs[0].publicKey ? '✅' : '❌');
    
    console.log(`✅ ${signResult.csrs.length} CSR(s) généré(s)`);

    // ÉTAPE 3 : Envoyer au backend
    const backendPayload = {
      email: form.email,
      password: form.password,
      csrs: signResult.csrs,
    };
    
    console.log('📤 [REGISTER] Envoi au backend:');
    console.log('  - URL: /api/fus/register-verifier');
    console.log('  - email:', backendPayload.email);
    console.log('  - password:', backendPayload.password ? '***présent***' : 'MANQUANT');
    console.log('  - csrs count:', backendPayload.csrs.length);
    
    const backendResponse = await axios.post('/api/fus/register-verifier', backendPayload);

    console.log('✅ [REGISTER] Réponse backend:', backendResponse.data);

    setSuccess(backendResponse.data);
    setStep(3);

    localStorage.setItem('userId', backendResponse.data.userId || '');
    localStorage.setItem('userEmail', form.email);

  } catch (err) {
    console.error('❌ [REGISTER] Erreur inscription détaillée:');
    console.error('  - message:', err.message);
    console.error('  - response data:', err.response?.data);
    console.error('  - response status:', err.response?.status);
    console.error('  - response statusText:', err.response?.statusText);
    
    // Afficher l'erreur du backend si disponible
    const backendError = err.response?.data?.error || err.response?.data?.message || err.message;
    setError(backendError || 'REGISTRATION_FAILED');
    setStep(1);
  } finally {
    setLoading(false);
  }
};

  // ====================== AFFICHAGE ======================
  return (
    <>
      <Header />
    <div className="register-page">
      <div className="scanline"></div>
      
      <div className="register-card">
        <div className="corner-tr"></div>
        <div className="corner-bl"></div>

        {/* Logo et header */}
        <div className="logo-section">
          <div className="logo-hex">
            <svg viewBox="0 0 40 40" fill="none">
              <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="#00b4ff" strokeWidth="1" fill="rgba(0,180,255,0.08)" />
              <polygon points="20,8 32,15 32,25 20,32 8,25 8,15" stroke="#00ffea" strokeWidth="0.5" fill="rgba(0,255,234,0.04)" />
              <text x="20" y="24" textAnchor="middle" fill="#00b4ff" fontSize="10" fontFamily="'Share Tech Mono'" fontWeight="bold">SC</text>
            </svg>
          </div>
          <div className="logo-text-container">
            <span className="logo-text glitch">DRIVESECURE</span>
            <span className="logo-sub">ENCRYPTED STORAGE SYSTEM v2.0</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress-wrap">
          {[1, 2, 3].map(i => (
            <div key={i} className={`progress-seg ${step >= i ? 'active' : ''}`}></div>
          ))}
        </div>



        {/* Extension Status simplifié */}
        {step === 1 && !extensionReady && (
          <div className="extension-status error">
            <div className="status-icon">🔒</div>
            <div className="status-content">
              <div className="status-title">SECURECLOUD_EXTENSION_NOT_DETECTED</div>
              <div className="status-message">Please install SecureCloud extension to continue.</div>
            </div>
          </div>
        )}

        {step === 1 && extensionReady && (
          <div className="extension-status success">
            <div className="status-icon">🔐</div>
            <div className="status-content">
              <div className="status-title">✓ SECURECLOUD_READY</div>
              <div className="status-message">Extension detected. You can now register.</div>
            </div>
          </div>
        )}


        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">✗</span>
            <span className="alert-text">
              {error === 'SECURECLOUD_EXTENSION_NOT_FOUND' && 'SecureCloud extension not detected. Please install the extension.'}
              {error === 'PASSWORD_TOO_WEAK' && 'Password does not meet security requirements.'}
              {error === 'PASSWORD_MISMATCH' && 'Passwords do not match.'}
              {error === 'ALL_FIELDS_REQUIRED' && 'All fields are required.'}
              {error === 'SERVER_ERROR' && 'Server error. Please try again later.'}
              {!error.startsWith('SECURECLOUD') && error !== 'PASSWORD_TOO_WEAK' && error !== 'PASSWORD_MISMATCH' && error !== 'ALL_FIELDS_REQUIRED' && error !== 'SERVER_ERROR' && error}
            </span>
          </div>
        )}

        {!success ? (
          <form onSubmit={handleRegister} className="register-form">
            <div className="form-group">
              <label>
                <span className="label-number">01</span>
                <span className="label-text">EMAIL_ADDRESS</span>
              </label>
              <input
                type="email"
                name="email"
                placeholder="user@domain.com"
                value={form.email}
                onChange={handleChange}
                disabled={loading}
                className={form.email ? (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? 'error' : 'valid') : ''}
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label>
                <span className="label-number">02</span>
                <span className="label-text">PASSWORD_HASH</span>
              </label>
              <input
                type="password"
                name="password"
                placeholder="••••••••••••"
                value={form.password}
                onChange={handleChange}
                onFocus={() => setShowReqs(true)}
                disabled={loading}
                className={form.password ? (allMet ? 'valid' : 'error') : ''}
                autoComplete="off"
              />
              
              {form.password && (
                <>
                  <div className="strength-bar">
                    {[1, 2, 3, 4, 5].map(i => {
                      const met = Object.values(checks).filter(Boolean).length
                      return <div key={i} className={`strength-seg ${i <= met ? strength : ''}`}></div>
                    })}
                  </div>
                  <div className={`strength-text ${strength}`}>
                    PWD_STRENGTH: {strengthLabel[strength]}
                  </div>
                </>
              )}
              
              {showReqs && (
                <div className="requirements">
                  {REQS.map(r => (
                    <div key={r.key} className={`requirement ${checks[r.key] ? 'met' : ''}`}>
                      <span className="req-icon">{checks[r.key] ? '✓' : '○'}</span>
                      <span>{r.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>
                <span className="label-number">03</span>
                <span className="label-text">CONFIRM_PASSWORD</span>
              </label>
              <input
                type="password"
                name="confirm"
                placeholder="••••••••••••"
                value={form.confirm}
                onChange={handleChange}
                disabled={loading}
                className={form.confirm ? (form.confirm === form.password ? 'valid' : 'error') : ''}
                autoComplete="off"
              />
              {form.confirm && form.confirm !== form.password && (
                <div className="error-hint">
                  ✗ PASSWORD_MISMATCH_DETECTED
                </div>
              )}
            </div>

            <button 
              className="btn btn-primary" 
              type="submit" 
              disabled={loading || !extensionReady || !allMet}
            >
              {loading ? (
                <>
                  <div className="spinner"></div>
                  <span>{step === 2 ? 'SENDING_TO_SERVER...' : 'PROCESSING...'}</span>
                </>
              ) : (
                <span>[ INITIALIZE ACCOUNT ]</span>
              )}
            </button>
          </form>
        ) : (
          <div className="success-container">
            <div className="success-ring">✓</div>
            
            <div className="alert alert-success">
              <span className="alert-icon">✓</span>
              <span className="alert-text">
                ACCOUNT_INITIALIZED. EMAIL_SENT TO {success.email}
              </span>
            </div>

            {success.previewUrl && (
              <div className="alert alert-info">
                <span className="alert-icon">→</span>
                <span className="alert-text">
                  EMAIL_PREVIEW:{' '}
                  <a href={success.previewUrl} target="_blank" rel="noreferrer" className="link">
                    OPEN_ETHEREAL
                  </a>
                </span>
              </div>
            )}
            
            <button 
              className="btn btn-secondary" 
              onClick={() => navigate('/login')}
            >
              [ PROCEED TO LOGIN ]
            </button>
          </div>
        )}
       
        {/* Lien de login */}
        <div className="login-link-wrapper">
          <div className="login-link-content">
            <div className="login-link-left">
              <span className="link-prompt">$</span>
              <span className="link-text">ALREADY_HAVE_ACCOUNT?</span>
            </div>
            <div className="login-link-right">
              <button 
                className="login-link-btn"
                onClick={() => navigate('/login')}
              >
                [ LOGIN &gt; ]
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}