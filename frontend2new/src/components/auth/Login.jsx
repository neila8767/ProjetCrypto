import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../../contexts/AuthContext';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  
  const [step, setStep] = useState(1); // 1: credentials, 2: signature, 3: OTP
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [challengeData, setChallengeData] = useState(null);
  const [tempToken, setTempToken] = useState('');
  const [otp, setOtp] = useState('');
  const [signingStatus, setSigningStatus] = useState({});
  const [signatures, setSignatures] = useState([]);
  
  // État pour l'extension SecureCloud
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [checkingExtension, setCheckingExtension] = useState(true);

  // Vérifier la présence de l'extension au chargement
  useEffect(() => {
    const checkExtension = async () => {
      try {
        setCheckingExtension(true);
        
        let attempts = 0;
        while (!window.myWallet && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (window.myWallet) {
          setExtensionDetected(true);
          console.log('✅ Extension SecureCloud détectée');
          console.log('🔑 Méthodes disponibles:', Object.keys(window.myWallet));
        } else {
          setExtensionDetected(false);
          console.log('❌ Extension SecureCloud non détectée');
        }
      } catch (err) {
        console.error('Erreur détection extension:', err);
        setExtensionDetected(false);
      } finally {
        setCheckingExtension(false);
      }
    };
    
    checkExtension();
    
    window.addEventListener('securecloud:ready', () => {
      console.log('🎉 [CLIENT] Événement securecloud:ready reçu');
      setExtensionDetected(true);
      setCheckingExtension(false);
    });
    
    return () => {
      window.removeEventListener('securecloud:ready', () => {});
    };
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  // ÉTAPE 1: Envoyer email + mot de passe cloud
  const handleSubmitCredentials = async (e) => {
    e.preventDefault();
    
    console.log('\n🚪 [CLIENT] ====== ÉTAPE 1: INITIATE LOGIN ======');
    
    if (!form.email || !form.password) {
      setError('ALL_FIELDS_REQUIRED');
      return;
    }
    
    if (!extensionDetected) {
      setError('SECURECLOUD_EXTENSION_NOT_FOUND');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      console.log('📤 [CLIENT] Envoi credentials au serveur...');
      const res = await axios.post('/api/auth/login/init', {
        email: form.email,
        password: form.password
      });
      
      console.log('📥 [CLIENT] Réponse du serveur:', res.data);
      console.log(`   - challengeId: ${res.data.challengeId?.substring(0, 16)}...`);
      console.log(`   - nombre de challenges: ${res.data.challenges?.length}`);
      console.log(`   - threshold: ${res.data.threshold}`);
      
      setChallengeData(res.data);
      setStep(2);
      
      // Initialiser les statuts de signature
      const initialStatus = {};
      res.data.challenges.forEach(challenge => {
        initialStatus[challenge.walletAccountId] = { status: 'pending', message: 'En attente de signature...' };
      });
      setSigningStatus(initialStatus);
      setSignatures([]);
      
      // Commencer la signature de TOUS les challenges
      await signAllChallenges(res.data);
      
    } catch (err) {
      console.error('❌ Erreur initiate login:', err);
      setError(err.response?.data?.error || 'LOGIN_FAILED');
    } finally {
      setLoading(false);
    }
  };
  
  // ✅ signAllChallenges - Signer TOUS les wallets
  const signAllChallenges = async (data) => {
    const { challengeId, challenges, threshold } = data;
    
    console.log('\n🔏 [CLIENT] ====== SIGNATURE DE TOUS LES WALLETS ======');
    console.log(`   - challengeId: ${challengeId?.substring(0, 16)}...`);
    console.log(`   - Nombre de wallets à signer: ${challenges?.length}`);
    console.log(`   - Threshold: ${threshold}`);
    
    if (!challenges || challenges.length === 0) {
      console.error('❌ Aucun challenge reçu du serveur');
      setError('NO_CHALLENGES_RECEIVED');
      setStep(1);
      return;
    }
    
    const collectedSignatures = [];
    
    // Signer CHAQUE wallet un par un
    for (let i = 0; i < challenges.length; i++) {
      const challenge = challenges[i];
      console.log(`\n🔐 [CLIENT] Wallet ${i + 1}/${challenges.length}: ${challenge.walletAccountId}`);
      console.log(`   - accountName: ${challenge.accountName}`);
      console.log(`   - accountType: ${challenge.accountType}`);
      
      // Mettre à jour le statut
      setSigningStatus(prev => ({
        ...prev,
        [challenge.walletAccountId]: { 
          status: 'signing', 
          message: `Signature en cours pour ${challenge.accountName}...`,
          accountName: challenge.accountName,
          accountType: challenge.accountType
        }
      }));
      
      try {
        if (!window.myWallet) {
          throw new Error('Extension SecureCloud non disponible');
        }
        
        if (typeof window.myWallet.signChallenge !== 'function') {
          throw new Error('signChallenge method not available');
        }
        
        console.log(`   📝 Challenge à signer: ${challenge.challenge.substring(0, 50)}...`);
        console.log(`   🔢 Nonce: ${challenge.nonce.substring(0, 16)}...`);
        console.log(`   ⏰ Timestamp: ${challenge.timestamp}`);
        
        // Appeler l'extension avec l'accountId du wallet
        const result = await window.myWallet.signChallenge({
          accountId: challenge.walletAccountId,
          challenge: challenge.challenge,
          nonce: challenge.nonce,
          timestamp: challenge.timestamp,
          site: 'DriveSECURE'
        });
        
        console.log(`   📦 Résultat signature reçu pour ${challenge.walletAccountId}:`, result);
        
        if (!result || !result.signature) {
          throw new Error('Signature invalide reçue de l\'extension');
        }
        
        // // Récupérer la clé publique depuis l'extension
        // const publicKey = result.publicKey || await window.myWallet.getPublicKey({ accountId: challenge.walletAccountId });
        
        collectedSignatures.push({
          walletAccountId: challenge.walletAccountId,
          signature: result.signature,
          // publicKey: publicKey
        });
        
        console.log(`   ✅ Signature obtenue pour ${challenge.accountName}`);
        console.log(`      - signature (début): ${result.signature.substring(0, 50)}...`);
        
        // Mettre à jour le statut
        setSigningStatus(prev => ({
          ...prev,
          [challenge.walletAccountId]: { 
            status: 'done', 
            message: `✓ Signature validée pour ${challenge.accountName}`,
            accountName: challenge.accountName,
            accountType: challenge.accountType
          }
        }));
        
        setSignatures([...collectedSignatures]);
        
      } catch (err) {
        console.error(`❌ Erreur signature pour ${challenge.walletAccountId}:`, err);
        
        if (err.message === 'User cancelled' || err.message.includes('cancel') || err.message === 'Request timeout') {
          setSigningStatus(prev => ({
            ...prev,
            [challenge.walletAccountId]: { 
              status: 'cancelled', 
              message: `❌ Signature annulée pour ${challenge.accountName}`,
              accountName: challenge.accountName,
              accountType: challenge.accountType
            }
          }));
          setError('SIGNATURE_CANCELLED');
          setStep(1);
          return;
        }
        
        setSigningStatus(prev => ({
          ...prev,
          [challenge.walletAccountId]: { 
            status: 'error', 
            message: `❌ Erreur: ${err.message}`,
            accountName: challenge.accountName,
            accountType: challenge.accountType
          }
        }));
        setError(`Échec signature ${challenge.accountName}: ${err.message}`);
        setStep(1);
        return;
      }
    }
    
    // Toutes les signatures sont collectées
    console.log(`\n✅ [CLIENT] ${collectedSignatures.length}/${challenges.length} signatures collectées`);
    console.log('   Envoi au serveur pour vérification...');
    
    await verifyAllSignatures(challengeId, collectedSignatures);
  };

  // ✅ verifyAllSignatures - Envoyer TOUTES les signatures au serveur
  const verifyAllSignatures = async (challengeId, signatures) => {
    try {
      console.log('\n📤 [CLIENT] Envoi des signatures au serveur:');
      console.log(`   - challengeId: ${challengeId?.substring(0, 16)}...`);
      console.log(`   - nombre de signatures: ${signatures.length}`);
      
      signatures.forEach((sig, idx) => {
        console.log(`   Signature ${idx + 1}:`);
        console.log(`      - walletAccountId: ${sig.walletAccountId}`);
        console.log(`      - signature (début): ${sig.signature?.substring(0, 50)}...`);
       });
      
      const verifyRes = await axios.post('/api/auth/login/verify-signatures', {
        challengeId: challengeId,
        signatures: signatures
      });
      
      console.log('📥 [CLIENT] Réponse du serveur (verify):', verifyRes.data);
      
      if (verifyRes.data.success) {
        setTempToken(verifyRes.data.tempToken);
        
        if (verifyRes.data.requires2FA) {
          console.log('🔐 2FA requis, envoi OTP...');
          await axios.post('/api/auth/login/send-otp', {
            tempToken: verifyRes.data.tempToken
          });
          setStep(3);
        } else {
          console.log('✅ Login réussi sans 2FA');
          
          login({
            accessToken: verifyRes.data.accessToken,
            refreshToken: verifyRes.data.refreshToken,
            user: verifyRes.data.user
          });
          
          navigate('/pages/Dashboard');
        }
      } else {
        console.error('❌ Échec vérification signatures:', verifyRes.data.error);
        setError(verifyRes.data.error || 'SIGNATURE_VERIFICATION_FAILED');
        setStep(1);
      }
    } catch (err) {
      console.error('❌ Erreur vérification signatures:', err);
      const errorMessage = err.response?.data?.error || err.message || 'SIGNATURE_VERIFICATION_FAILED';
      setError(errorMessage);
      setStep(1);
    }
  };
  
  // ÉTAPE 3: Vérifier l'OTP
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    
    console.log('\n🔐 [CLIENT] ====== ÉTAPE 3: VERIFY OTP ======');
    
    if (!otp || otp.length !== 6) {
      setError('INVALID_OTP_FORMAT');
      return;
    }
    
    setLoading(true);
    
    try {
      console.log('📤 [CLIENT] Envoi OTP au serveur...');
      const res = await axios.post('/api/auth/login/verify-otp', {
        tempToken: tempToken,
        otp: otp
      });
      
      console.log('✅ OTP vérifié avec succès');
      console.log('📥 Réponse:', res.data);
      
      login({
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        user: res.data.user
      });
      
      navigate('../../pages/Dashboard');
      
    } catch (err) {
      console.error('❌ Erreur vérification OTP:', err);
      setError(err.response?.data?.error || 'INVALID_OTP');
    } finally {
      setLoading(false);
    }
  };
  
  // Resend OTP
  const handleResendOTP = async () => {
    try {
      setLoading(true);
      await axios.post('/api/auth/login/send-otp', { tempToken });
      alert('Un nouveau code OTP a été envoyé à votre email');
    } catch (err) {
      console.error('❌ Erreur renvoi OTP:', err);
      setError('FAILED_TO_SEND_OTP');
    } finally {
      setLoading(false);
    }
  };
  
  // Ouvrir l'extension SecureCloud
  const handleOpenExtension = async () => {
    try {
      if (window.myWallet && window.myWallet.openPopup) {
        await window.myWallet.openPopup();
      } else if (chrome?.runtime?.id) {
        window.open(`chrome-extension://${chrome.runtime.id}/popup.html`, '_blank');
      } else {
        alert('Veuillez cliquer sur l\'icône SecureCloud dans votre navigateur');
      }
    } catch (err) {
      console.error('❌ Erreur ouverture popup:', err);
      alert('Impossible d\'ouvrir la popup. Veuillez cliquer sur l\'icône SecureCloud.');
    }
  };
  
  // Rendu de l'étape 1 - Credentials
  const renderStep1 = () => (
    <form onSubmit={handleSubmitCredentials} className="login-form">
      {!extensionDetected && !checkingExtension && (
        <div className="alert alert-error">
          <span className="alert-icon">⚠️</span>
          <span className="alert-text">
            Extension SecureCloud non détectée. Veuillez l'installer pour continuer.
          </span>
          <button onClick={handleOpenExtension} className="error-action-btn">
            INSTALLER
          </button>
        </div>
      )}
      
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
          disabled={loading || checkingExtension}
          autoComplete="off"
        />
      </div>
      
      <div className="form-group">
        <label>
          <span className="label-number">02</span>
          <span className="label-text">CLOUD_PASSWORD</span>
        </label>
        <input
          type="password"
          name="password"
          placeholder="••••••••••••"
          value={form.password}
          onChange={handleChange}
          disabled={loading || checkingExtension}
          autoComplete="off"
        />
      </div>
      
      <button 
        type="submit" 
        className="btn btn-primary" 
        disabled={loading || checkingExtension || !extensionDetected}
      >
        {loading ? (
          <>
            <div className="spinner"></div>
            <span>AUTHENTICATING...</span>
          </>
        ) : checkingExtension ? (
          <span>CHECKING_EXTENSION...</span>
        ) : (
          <span>[ LOGIN ]</span>
        )}
      </button>
      
      <div className="extension-status">
        <div className={`status-dot ${extensionDetected ? 'green' : 'red'}`}></div>
        <span className="status-text">
          {checkingExtension ? '// VERIFYING_SECURECLOUD_EXTENSION...' : 
           extensionDetected ? '// SECURECLOUD_EXTENSION_DETECTED' : 
           '// SECURECLOUD_EXTENSION_NOT_FOUND'}
        </span>
      </div>
    </form>
  );
  
  // Rendu de l'étape 2 - Signature MULTI-WALLET
  const renderStep2 = () => {
    const { challenges, threshold, expiresIn } = challengeData || {};
    const totalWallets = challenges?.length || 0;
    const completedSignatures = Object.values(signingStatus).filter(s => s.status === 'done').length;
    const allSigned = completedSignatures === totalWallets;
    
    return (
      <div className="signature-step multi-wallet">
        <div className="step-header">
          <div className="step-icon">🔐</div>
          <h3>MULTI-WALLET VERIFICATION</h3>
          <p className="step-desc">
            Signez les challenges cryptographiques avec CHAQUE wallet SecureCloud
          </p>
        </div>
        
        <div className="threshold-badge">
          <span className="threshold-label">SEUIL DE SIGNATURE</span>
          <span className="threshold-value">{completedSignatures} / {totalWallets}</span>
          {allSigned && <span className="threshold-check">✓ TOUS SIGNÉS</span>}
        </div>
        
        <div className="wallets-list">
          {challenges?.map((challenge, idx) => {
            const status = signingStatus[challenge.walletAccountId] || { status: 'pending', message: 'En attente...' };
            
            return (
              <div key={challenge.walletAccountId} className={`wallet-signature-card ${status.status}`}>
                <div className="wallet-header">
                  <div className="wallet-icon">
                    {status.status === 'done' ? '✅' : status.status === 'signing' ? '🔄' : status.status === 'error' ? '❌' : '⏳'}
                  </div>
                  <div className="wallet-info">
                    <div className="wallet-name">{challenge.accountName}</div>
                    <div className="wallet-type">{challenge.accountType}</div>
                    <div className="wallet-id">{challenge.walletAccountId.substring(0, 16)}...</div>
                  </div>
                  <div className="wallet-status">
                    <span className={`status-badge ${status.status}`}>
                      {status.status === 'done' ? 'SIGNÉ' : 
                       status.status === 'signing' ? 'EN COURS' : 
                       status.status === 'error' ? 'ERREUR' : 
                       status.status === 'cancelled' ? 'ANNULÉ' : 'EN ATTENTE'}
                    </span>
                  </div>
                </div>
                
                <div className="challenge-details">
                  <div className="detail-line">
                    <span className="detail-label">Challenge:</span>
                    <code className="detail-value">{challenge.challenge.substring(0, 40)}...</code>
                  </div>
                  <div className="detail-line">
                    <span className="detail-label">Nonce:</span>
                    <code className="detail-value">{challenge.nonce.substring(0, 16)}...</code>
                  </div>
                  <div className="detail-line">
                    <span className="detail-label">Timestamp:</span>
                    <code className="detail-value">{new Date(challenge.timestamp).toLocaleTimeString()}</code>
                  </div>
                </div>
                
                {status.message && (
                  <div className={`signature-message ${status.status}`}>
                    {status.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {!allSigned && (
          <div className="help-box">
            <div className="help-icon">💡</div>
            <div className="help-text">
              Une popup SecureCloud va s'ouvrir pour CHAQUE wallet. 
              Veuillez signer TOUS les challenges.
              <button onClick={handleOpenExtension} className="help-link">
                Ouvrir l'extension manuellement
              </button>
            </div>
          </div>
        )}
        
        {allSigned && (
          <div className="success-box">
            <div className="success-icon">🎉</div>
            <div className="success-text">
              Tous les wallets ont signé avec succès ! Vérification en cours...
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // Rendu de l'étape 3 - OTP
  const renderStep3 = () => (
    <form onSubmit={handleVerifyOTP} className="otp-form">
      <div className="step-header">
        <div className="step-icon">📧</div>
        <h3>TWO-FACTOR AUTHENTICATION</h3>
        <p className="step-desc">
          Entrez le code à 6 chiffres envoyé à votre adresse email
        </p>
      </div>
      
      <div className="form-group">
        <label>OTP_CODE</label>
        <input
          type="text"
          placeholder="000000"
          maxLength="6"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          disabled={loading}
          className="otp-input"
          autoFocus
        />
      </div>
      
      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? (
          <>
            <div className="spinner"></div>
            <span>VERIFYING...</span>
          </>
        ) : (
          <span>[ VERIFY OTP ]</span>
        )}
      </button>
      
      <button
        type="button"
        className="btn-link"
        onClick={handleResendOTP}
        disabled={loading}
      >
        Resend OTP
      </button>
    </form>
  );
  
  return (
    <div className="login-page">
      <div className="scanline"></div>
      
      <div className="login-card">
        <div className="corner-tr"></div>
        <div className="corner-bl"></div>
        
        <div className="logo-section">
          <div className="logo-hex">
            <svg viewBox="0 0 40 40" fill="none">
              <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="#00b4ff" strokeWidth="1" fill="rgba(0,180,255,0.08)" />
              <polygon points="20,8 32,15 32,25 20,32 8,25 8,15" stroke="#00ffea" strokeWidth="0.5" fill="rgba(0,255,234,0.04)" />
              <text x="20" y="24" textAnchor="middle" fill="#00b4ff" fontSize="10" fontFamily="'Share Tech Mono'" fontWeight="bold">DS</text>
            </svg>
          </div>
          <div className="logo-text-container">
            <span className="logo-text glitch">DRIVESECURE</span>
            <span className="logo-sub">ENCRYPTED STORAGE SYSTEM v2.0</span>
          </div>
        </div>
        
        <div className="progress-steps">
          <div className={`step-indicator ${step >= 1 ? 'active' : ''}`}>
            <span className="step-num">1</span>
            <span className="step-label">Credentials</span>
          </div>
          <div className={`step-indicator ${step >= 2 ? 'active' : ''}`}>
            <span className="step-num">2</span>
            <span className="step-label">Multi-Signature</span>
          </div>
          <div className={`step-indicator ${step >= 3 ? 'active' : ''}`}>
            <span className="step-num">3</span>
            <span className="step-label">2FA</span>
          </div>
        </div>
        
        <div className="status-bar">
          <div className={`status-dot ${step === 1 && extensionDetected ? 'green' : step === 2 ? 'yellow' : step === 3 ? 'green' : 'red'}`}></div>
          <span className="status-text">
            {step === 1 && '// AUTHENTICATION_PROTOCOL'}
            {step === 2 && '// MULTI_WALLET_SIGNATURE_REQUIRED...'}
            {step === 3 && '// 2FA_VERIFICATION_PENDING'}
          </span>
        </div>
        
        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">✗</span>
            <span className="alert-text">
              {error === 'ALL_FIELDS_REQUIRED' && 'Tous les champs sont requis'}
              {error === 'SECURECLOUD_EXTENSION_NOT_FOUND' && 'Extension SecureCloud non détectée. Veuillez l\'installer.'}
              {error === 'SIGNATURE_CANCELLED' && 'Signature annulée par l\'utilisateur'}
              {error === 'INVALID_OTP_FORMAT' && 'Le code OTP doit contenir 6 chiffres'}
              {error === 'INVALID_OTP' && 'Code OTP invalide'}
              {error === 'LOGIN_FAILED' && 'Email ou mot de passe incorrect'}
              {error === 'ACCOUNT_NOT_ACTIVATED' && 'Compte non activé. Vérifiez vos emails.'}
              {!error.startsWith('ALL_FIELDS') && 
               !error.startsWith('SECURECLOUD') && 
               !error.startsWith('SIGNATURE') && 
               !error.startsWith('INVALID_OTP') && 
               !error.startsWith('LOGIN_FAILED') && 
               !error.startsWith('ACCOUNT_NOT') && error}
            </span>
            {error === 'SECURECLOUD_EXTENSION_NOT_FOUND' && (
              <button onClick={handleOpenExtension} className="error-action-btn">
                INSTALLER
              </button>
            )}
          </div>
        )}
        
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        
        <div className="login-footer">
          <a href="/register" className="register-link">
            [ NO_ACCOUNT? REGISTER ]
          </a>
        </div>
      </div>
    </div>
  );
}