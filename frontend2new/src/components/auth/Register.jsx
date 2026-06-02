// import React, { useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
// import axios from 'axios';
//   // ← Assure-toi d'avoir installé argon2-browser
// import './Register.css';

// function checkPassword(p) {
//   return {
//     length: p.length >= 12,
//     upper: /[A-Z]/.test(p),
//     lower: /[a-z]/.test(p),
//     number: /[0-9]/.test(p),
//     special: /[!@#$%^&*]/.test(p),
//   };
// }

// function getStrength(checks) {
//   const n = Object.values(checks).filter(Boolean).length;
//   if (n <= 2) return 'weak';
//   if (n <= 4) return 'medium';
//   return 'strong';
// }

// const REQS = [
//   { key: 'length', label: '12 CHARS MIN' },
//   { key: 'upper', label: 'UPPERCASE [A-Z]' },
//   { key: 'lower', label: 'LOWERCASE [a-z]' },
//   { key: 'number', label: 'DIGIT [0-9]' },
//   { key: 'special', label: 'SPECIAL [!@#$%^&*]' },
// ];

// export default function Register() {
//   const navigate = useNavigate();

//   const [form, setForm] = useState({ email: '', password: '', confirm: '' });
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState('');
//   const [success, setSuccess] = useState(null);
//   const [step, setStep] = useState(1);

//   // États SecureCloud
//   const [extensionDetected, setExtensionDetected] = useState(false);
//   const [extensionUnlocked, setExtensionUnlocked] = useState(false);
//   const [walletAccounts, setWalletAccounts] = useState([]);
//   const [checkingExtension, setCheckingExtension] = useState(true);
//   const [extensionError, setExtensionError] = useState(null);

//   const checks = checkPassword(form.password);
//   const strength = form.password ? getStrength(checks) : null;
//   const allMet = Object.values(checks).every(Boolean);

//   const handleChange = (e) => {
//     setForm({ ...form, [e.target.name]: e.target.value });
//     setError('');
//   };

//   // ====================== OUVRIR L'EXTENSION ======================
//   const handleOpenExtension = async () => {
//     console.log('🔵 [REGISTER] handleOpenExtension called');
//     console.log('window.myWallet:', window.myWallet);
//     console.log('window.myWallet.openPopup:', window.myWallet?.openPopup);
    
//     try {
//         if (window.myWallet && window.myWallet.openPopup) {
//             console.log('🟢 [REGISTER] Calling openPopup');
//             const result = await window.myWallet.openPopup();
//             console.log('🟢 [REGISTER] openPopup result:', result);
//         } else {
//             console.error('❌ [REGISTER] myWallet.openPopup not available');
//             if (chrome?.runtime?.id) {
//                 window.open(`chrome-extension://${chrome.runtime.id}/popup.html`, '_blank');
//             }
//         }
//     } catch (error) {
//         console.error('❌ [REGISTER] Erreur:', error);
//     }
// };

//   // ====================== VÉRIFICATION DE L'EXTENSION ======================
//   useEffect(() => {
//     const checkSecureCloudExtension = async () => {
//       try {
//         setCheckingExtension(true);
//         setExtensionError(null);

//         // Attendre que window.myWallet soit disponible
//         let attempts = 0;
//         while (!window.myWallet && attempts < 30) {
//           await new Promise((resolve) => setTimeout(resolve, 100));
//           attempts++;
//         }

//         if (!window.myWallet) {
//           setExtensionDetected(false);
//           setExtensionError('EXTENSION_NOT_INSTALLED');
//           return;
//         }

//         setExtensionDetected(true);

//         // Vérifier si déverrouillé
//         const unlockedResult = await window.myWallet.isUnlocked();
//         const isUnlocked = unlockedResult?.unlocked || false;

//         if (!isUnlocked) {
//           setExtensionUnlocked(false);
//           setExtensionError('WALLET_LOCKED');
//           return;
//         }

//         // Récupérer les comptes
//         let accounts = await window.myWallet.getAllAccounts();

//         // Gestion du format de réponse (objet ou tableau)
//         if (accounts && typeof accounts === 'object' && !Array.isArray(accounts)) {
//           const keys = Object.keys(accounts).filter(k => !isNaN(parseInt(k)));
//           if (keys.length > 0) {
//             accounts = keys.map(key => accounts[key]);
//           }
//         }

//         if (!accounts || accounts.length === 0) {
//           accounts = await window.myWallet.getAccounts();
//         }

//         if (accounts && accounts.length > 0) {
//           setWalletAccounts(accounts);
//           setExtensionUnlocked(true);
//           setExtensionError(null);
//         } else {
//           setExtensionError('NO_ACCOUNTS');
//         }
//       } catch (err) {
//         console.error('Erreur extension:', err);
//         setExtensionError('EXTENSION_ERROR');
//       } finally {
//         setCheckingExtension(false);
//       }
//     };

//     checkSecureCloudExtension();

//     // Écouter les notifications de déverrouillage
//     const handleExtensionMessage = async (event) => {
//       if (event.data?.type === 'securecloud:unlocked') {
//         const result = await window.myWallet.isUnlocked();
//         if (result?.unlocked) {
//           setExtensionUnlocked(true);
//           // Recharger les comptes
//           let accounts = await window.myWallet.getAllAccounts();
//           if (accounts && accounts.length > 0) setWalletAccounts(accounts);
//         }
//       }
//     };

//     window.addEventListener('message', handleExtensionMessage);
//     return () => window.removeEventListener('message', handleExtensionMessage);
//   }, []);

//   // ====================== FONCTION PRINCIPALE D'INSCRIPTION ======================
//   const handleRegister = async (e) => {
//     e.preventDefault();

//     if (!form.email || !form.password || form.password !== form.confirm) {
//       setError('ALL_FIELDS_REQUIRED_OR_MISMATCH');
//       return;
//     }
//     if (!allMet) {
//       setError('PASSWORD_TOO_WEAK');
//       return;
//     }
//     if (!extensionDetected || !extensionUnlocked || walletAccounts.length === 0) {
//       setError('SECURECLOUD_NOT_READY');
//       handleOpenExtension();
//       return;
//     }

//     setLoading(true);
//     setError('');

//     try {
//       // // 1. Hasher le mot de passe avec Argon2
//       // const argon2Result = await argon2.hash({
//       //   pass: form.password,
//       //   salt: new TextEncoder().encode('drivecloud-secure-salt-2026'), // À remplacer par un salt meilleur en prod
//       //   time: 3,
//       //   mem: 1024 * 64,   // 64 MiB
//       //   hashLen: 32,
//       //   type: argon2.ArgonType.Argon2id,
//       // });

//       // const password = btoa(
//       //   String.fromCharCode(...new Uint8Array(argon2Result.hash))
//       // );

//       console.log('✅ Mot de passe hashé avec Argon2');

//       // 2. Envoyer à Secure Cloud pour générer les CSR (un par wallet)
//       const signResult = await window.myWallet.send('signRegistration', {
//         email: form.email,
//         password: form.password,
//       });

//       if (!signResult?.csrs || signResult.csrs.length === 0) {
//         throw new Error('Aucun CSR généré par SecureCloud');
//       }

//       console.log(`✅ ${signResult.csrs.length} CSR(s) généré(s)`);

//       // 3. Envoyer les CSR au backend Drive Cloud
//       const backendResponse = await axios.post('/api/fus/register-verifier', {
//         email: form.email,
//         password: password,
//         csrs: signResult.csrs,           // Tableau de CSR
//       });

//       setSuccess(backendResponse.data);
//       setStep(3);

//       localStorage.setItem('userId', backendResponse.data.userId || '');
//       localStorage.setItem('userEmail', form.email);

//     } catch (err) {
//       console.error('Erreur inscription:', err);
//       setError(
//         err.response?.data?.message ||
//         err.message ||
//         'REGISTRATION_FAILED'
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   // ====================== AFFICHAGE ======================
//   return (
//     <div className="register-page">
//       <div className="scanline"></div>
      
//       <div className="register-card">
//         <div className="corner-tr"></div>
//         <div className="corner-bl"></div>

//         {/* Logo et header */}
//         <div className="logo-section">
//           <div className="logo-hex">
//             <svg viewBox="0 0 40 40" fill="none">
//               <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="#00b4ff" strokeWidth="1" fill="rgba(0,180,255,0.08)" />
//               <polygon points="20,8 32,15 32,25 20,32 8,25 8,15" stroke="#00ffea" strokeWidth="0.5" fill="rgba(0,255,234,0.04)" />
//               <text x="20" y="24" textAnchor="middle" fill="#00b4ff" fontSize="10" fontFamily="'Share Tech Mono'" fontWeight="bold">SC</text>
//             </svg>
//           </div>
//           <div className="logo-text-container">
//             <span className="logo-text glitch">DRIVESECURE</span>
//             <span className="logo-sub">ENCRYPTED STORAGE SYSTEM v2.0</span>
//           </div>
//         </div>

//         {/* Progress bar */}
//         <div className="progress-wrap">
//           {[1, 2, 3].map(i => (
//             <div key={i} className={`progress-seg ${step >= i ? 'active' : ''}`}></div>
//           ))}
//         </div>

//         {/* Status bar */}
//         <div className="status-bar">
//           <div className={`status-dot ${success ? 'green' : error ? 'red' : extensionDetected && extensionUnlocked ? 'green' : extensionDetected ? 'yellow' : 'red'}`}></div>
//           <span className="status-text">
//             {step === 1 && '// INIT_REGISTRATION_PROTOCOL'}
//             {step === 2 && '// SENDING_TO_DRIVESECURE...'}
//             {step === 3 && (success ? '// REGISTRATION_COMPLETE' : '// PROCESSING...')}
//           </span>
//         </div>

//         {/* SecureCloud Extension Status */}
//         {step === 1 && !checkingExtension && (
//           <div className={`extension-status ${extensionDetected && extensionUnlocked && walletAccounts.length > 0 ? 'success' : 'error'}`}>
//             <div className="status-icon">
//               {checkingExtension ? '⏳' : 
//                extensionDetected && extensionUnlocked && walletAccounts.length > 0 ? '🔐' : 
//                extensionDetected && extensionUnlocked ? '⚠️' : '🔒'}
//             </div>
//             <div className="status-content">
//               {checkingExtension ? (
//                 <>
//                   <div className="status-title">CHECKING_SECURECLOUD...</div>
//                   <div className="status-message">Detecting SecureCloud extension...</div>
//                 </>
//               ) : extensionDetected && extensionUnlocked && walletAccounts.length > 0 ? (
//                 <>
//                   <div className="status-title">✓ SECURECLOUD_CONNECTED</div>
//                   <div className="status-message">
//                     {walletAccounts.length} account(s) detected and ready
//                   </div>
//                 </>
//               ) : (
//                 <>
//                   <div className="status-title">
//                     {!extensionDetected ? 'SECURECLOUD_EXTENSION_NOT_DETECTED' :
//                      !extensionUnlocked ? 'WALLET_LOCKED' :
//                      'NO_ACCOUNTS_FOUND'}
//                   </div>
//                   <div className="status-message">
//                     {getExtensionErrorText()}
//                   </div>
//                   <div className="status-actions">
//                     {!extensionDetected && (
//                       <button onClick={handleRetryExtension} className="action-btn">⟳ RETRY</button>
//                     )}
//                     {(extensionDetected && !extensionUnlocked) || (extensionDetected && walletAccounts.length === 0) ? (
//                       <button onClick={handleOpenExtension} className="action-btn">🔓 OPEN EXTENSION</button>
//                     ) : null}
//                   </div>
//                 </>
//               )}
//             </div>
//           </div>
//         )}

//         {/* Wallet Accounts Preview */}
//         {step === 1 && extensionDetected && extensionUnlocked && walletAccounts.length > 0 && (
//           <div className="accounts-preview">
//             <div className="preview-title">
//               // DETECTED_WALLET_ACCOUNTS 
//               <span className="accounts-count">({walletAccounts.length})</span>
//             </div>
//             <div className="accounts-list">
//               {walletAccounts.map(acc => (
//                 <div key={acc.id} className="account-item">
//                   <span className="account-icon">{acc.icon || (acc.type === 'personal' ? '👤' : acc.type === 'sharing' ? '👥' : '🔑')}</span>
//                   <div className="account-info">
//                     <span className="account-name">{acc.name}</span>
//                     <span className="account-type">
//                       {acc.type === 'personal' ? 'PERSONAL' : 
//                        acc.type === 'sharing' ? 'SHARING' : 
//                        'CUSTOM'}
//                     </span>
//                   </div>
//                   <div className="account-fingerprint">
//                     {acc.publicKey?.substring(0, 30)}...
//                   </div>
//                 </div>
//               ))}
//             </div>
//             <div className="preview-footer">
//               <span className="info-icon">ℹ️</span>
//               <span>A certificate will be generated for each account</span>
//             </div>
//           </div>
//         )}

//         <h2 className="card-title">
//           {success ? 'ACCESS GRANTED' : 'NEW_USER_INIT'}
//         </h2>
        
//         <p className="card-subtitle">
//           {success
//             ? `> ACCOUNT CREATED. CHECK ${success.email} TO ACTIVATE.`
//             : '> ENTER CREDENTIALS. RSA KEYS WILL BE IMPORTED FROM SECURECLOUD.'}
//         </p>

//         {error && (
//           <div className="alert alert-error">
//             <span className="alert-icon">✗</span>
//             <span className="alert-text">
//               {error === 'SECURECLOUD_EXTENSION_NOT_FOUND' && 'SecureCloud extension not detected. Please install the extension.'}
//               {error === 'SECURECLOUD_WALLET_LOCKED' && 'SecureCloud wallet is locked. Click "OPEN EXTENSION" to unlock.'}
//               {error === 'NO_ACCOUNTS_FOUND' && 'No accounts found in SecureCloud. Create at least one account in the extension.'}
//               {error === 'PASSWORD_TOO_WEAK' && 'Password does not meet security requirements.'}
//               {error === 'PASSWORD_MISMATCH' && 'Passwords do not match.'}
//               {error === 'ALL_FIELDS_REQUIRED' && 'All fields are required.'}
//               {error === 'SERVER_ERROR' && 'Server error. Please try again later.'}
//               {!error.startsWith('SECURECLOUD') && error !== 'PASSWORD_TOO_WEAK' && error !== 'PASSWORD_MISMATCH' && error !== 'ALL_FIELDS_REQUIRED' && error !== 'SERVER_ERROR' && error}
//             </span>
//             {(error === 'SECURECLOUD_WALLET_LOCKED' || error === 'SECURECLOUD_EXTENSION_NOT_FOUND') && (
//               <button onClick={handleOpenExtension} className="error-action-btn">OPEN EXTENSION</button>
//             )}
//           </div>
//         )}

//         {!success ? (
//           <form onSubmit={handleRegister} className="register-form">
//             <div className="form-group">
//               <label>
//                 <span className="label-number">01</span>
//                 <span className="label-text">EMAIL_ADDRESS</span>
//               </label>
//               <input
//                 type="email"
//                 name="email"
//                 placeholder="user@domain.com"
//                 value={form.email}
//                 onChange={handleChange}
//                 disabled={loading}
//                 className={form.email ? (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? 'error' : 'valid') : ''}
//                 autoComplete="off"
//               />
//             </div>

//             <div className="form-group">
//               <label>
//                 <span className="label-number">02</span>
//                 <span className="label-text">PASSWORD_HASH</span>
//               </label>
//               <input
//                 type="password"
//                 name="password"
//                 placeholder="••••••••••••"
//                 value={form.password}
//                 onChange={handleChange}
//                 onFocus={() => setShowReqs(true)}
//                 disabled={loading}
//                 className={form.password ? (allMet ? 'valid' : 'error') : ''}
//                 autoComplete="off"
//               />
              
//               {form.password && (
//                 <>
//                   <div className="strength-bar">
//                     {[1, 2, 3, 4, 5].map(i => {
//                       const met = Object.values(checks).filter(Boolean).length
//                       return <div key={i} className={`strength-seg ${i <= met ? strength : ''}`}></div>
//                     })}
//                   </div>
//                   <div className={`strength-text ${strength}`}>
//                     PWD_STRENGTH: {strengthLabel[strength]}
//                   </div>
//                 </>
//               )}
              
//               {showReqs && (
//                 <div className="requirements">
//                   {REQS.map(r => (
//                     <div key={r.key} className={`requirement ${checks[r.key] ? 'met' : ''}`}>
//                       <span className="req-icon">{checks[r.key] ? '✓' : '○'}</span>
//                       <span>{r.label}</span>
//                     </div>
//                   ))}
//                 </div>
//               )}
//             </div>

//             <div className="form-group">
//               <label>
//                 <span className="label-number">03</span>
//                 <span className="label-text">CONFIRM_PASSWORD</span>
//               </label>
//               <input
//                 type="password"
//                 name="confirm"
//                 placeholder="••••••••••••"
//                 value={form.confirm}
//                 onChange={handleChange}
//                 disabled={loading}
//                 className={form.confirm ? (form.confirm === form.password ? 'valid' : 'error') : ''}
//                 autoComplete="off"
//               />
//               {form.confirm && form.confirm !== form.password && (
//                 <div className="error-hint">
//                   ✗ PASSWORD_MISMATCH_DETECTED
//                 </div>
//               )}
//             </div>

//             <button 
//               className="btn btn-primary" 
//               type="submit" 
//               disabled={loading || !extensionDetected || !extensionUnlocked || walletAccounts.length === 0 || !allMet}
//             >
//               {loading ? (
//                 <>
//                   <div className="spinner"></div>
//                   <span>{step === 2 ? 'SENDING_TO_SERVER...' : 'PROCESSING...'}</span>
//                 </>
//               ) : (
//                 <span>[ INITIALIZE ACCOUNT ]</span>
//               )}
//             </button>
//           </form>
//         ) : (
//           <div className="success-container">
//             <div className="success-ring">✓</div>
            
//             <div className="alert alert-success">
//               <span className="alert-icon">✓</span>
//               <span className="alert-text">
//                 ACCOUNT_INITIALIZED. EMAIL_SENT TO {success.email}
//               </span>
//             </div>

//             {success.previewUrl && (
//               <div className="alert alert-info">
//                 <span className="alert-icon">→</span>
//                 <span className="alert-text">
//                   EMAIL_PREVIEW:{' '}
//                   <a href={success.previewUrl} target="_blank" rel="noreferrer" className="link">
//                     OPEN_ETHEREAL
//                   </a>
//                 </span>
//               </div>
//             )}
            
//             {success.certificates && success.certificates.length > 0 && (
//               <div className="certificates-list">
//                 <div className="cert-title">// GENERATED_CERTIFICATES ({success.certificates.length})</div>
//                 {success.certificates.map((cert, idx) => (
//                   <div key={idx} className="cert-item">
//                     <span className="cert-icon">🔐</span>
//                     <div className="cert-info">
//                       <span className="cert-name">{cert.accountName}</span>
//                       <span className="cert-type">{cert.accountType}</span>
//                     </div>
//                     <span className="cert-fingerprint">{cert.fingerprint}</span>
//                   </div>
//                 ))}
//               </div>
//             )}
            
//             <button 
//               className="btn btn-secondary" 
//               onClick={() => navigate('/login')}
//             >
//               [ PROCEED TO LOGIN ]
//             </button>
//           </div>
//         )}
//        {/* Lien de login en bas - version horizontale en deux colonnes */}
//         <div className="login-link-wrapper">
//           <div className="login-link-content">
//             <div className="login-link-left">
//               <span className="link-prompt">$</span>
//               <span className="link-text">ALREADY_HAVE_ACCOUNT?</span>
//             </div>
//             <div className="login-link-right">
//               <button 
//                 className="login-link-btn"
//                 onClick={() => navigate('/login')}
//               >
//                 [ LOGIN &gt; ]
//               </button>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   )
// }


import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Register.css';

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

        {/* Status bar */}
        <div className="status-bar">
          <div className={`status-dot ${success ? 'green' : error ? 'red' : extensionReady ? 'green' : 'red'}`}></div>
          <span className="status-text">
            {step === 1 && '// INIT_REGISTRATION_PROTOCOL'}
            {step === 2 && '// SENDING_TO_DRIVESECURE...'}
            {step === 3 && (success ? '// REGISTRATION_COMPLETE' : '// PROCESSING...')}
          </span>
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

        <h2 className="card-title">
          {success ? 'ACCESS GRANTED' : 'NEW_USER_INIT'}
        </h2>
        
        <p className="card-subtitle">
          {success
            ? `> ACCOUNT CREATED. CHECK ${success.email} TO ACTIVATE.`
            : '> ENTER CREDENTIALS. RSA KEYS WILL BE IMPORTED FROM SECURECLOUD.'}
        </p>

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
  );
}