import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../../contexts/AuthContext';
import Header from '../../components/Header';   // ← Chemin à adapter selon votre structure
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [challengeData, setChallengeData] = useState(null);
  const [tempToken, setTempToken] = useState('');
  const [otp, setOtp] = useState('');
  const [signingStatus, setSigningStatus] = useState({});
  const [signatures, setSignatures] = useState([]);
  
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [checkingExtension, setCheckingExtension] = useState(true);

  useEffect(() => {
    const checkExtension = async () => {
      try {
        setCheckingExtension(true);
        let attempts = 0;
        while (!window.myWallet && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        setExtensionDetected(!!window.myWallet);
      } catch (err) {
        setExtensionDetected(false);
      } finally {
        setCheckingExtension(false);
      }
    };
    checkExtension();
    
    window.addEventListener('securecloud:ready', () => {
      setExtensionDetected(true);
      setCheckingExtension(false);
    });
    return () => window.removeEventListener('securecloud:ready', () => {});
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmitCredentials = async (e) => {
    e.preventDefault();
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
      const res = await axios.post('/api/auth/login/init', {
        email: form.email,
        password: form.password
      });
      setChallengeData(res.data);
      setStep(2);
      const initialStatus = {};
      res.data.challenges.forEach(challenge => {
        initialStatus[challenge.walletAccountId] = { status: 'pending', message: 'En attente de signature...' };
      });
      setSigningStatus(initialStatus);
      setSignatures([]);
      await signAllChallenges(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'LOGIN_FAILED');
    } finally {
      setLoading(false);
    }
  };
  
  const signAllChallenges = async (data) => {
    const { challengeId, challenges } = data;
    const collectedSignatures = [];
    for (let i = 0; i < challenges.length; i++) {
      const challenge = challenges[i];
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
        if (!window.myWallet) throw new Error('Extension non disponible');
        const result = await window.myWallet.signChallenge({
          accountId: challenge.walletAccountId,
          challenge: challenge.challenge,
          nonce: challenge.nonce,
          timestamp: challenge.timestamp,
          site: 'DriveSECURE'
        });
        collectedSignatures.push({
          walletAccountId: challenge.walletAccountId,
          signature: result.signature,
        });
        setSigningStatus(prev => ({
          ...prev,
          [challenge.walletAccountId]: { 
            status: 'done', 
            message: `✓ Signé pour ${challenge.accountName}`,
            accountName: challenge.accountName,
            accountType: challenge.accountType
          }
        }));
        setSignatures([...collectedSignatures]);
      } catch (err) {
        if (err.message === 'User cancelled' || err.message.includes('cancel')) {
          setSigningStatus(prev => ({
            ...prev,
            [challenge.walletAccountId]: { status: 'cancelled', message: `Annulé pour ${challenge.accountName}` }
          }));
          setError('SIGNATURE_CANCELLED');
          setStep(1);
          return;
        }
        setSigningStatus(prev => ({
          ...prev,
          [challenge.walletAccountId]: { status: 'error', message: `Erreur: ${err.message}` }
        }));
        setError(`Échec signature ${challenge.accountName}`);
        setStep(1);
        return;
      }
    }
    await verifyAllSignatures(challengeId, collectedSignatures);
  };

  const verifyAllSignatures = async (challengeId, signatures) => {
    try {
      const verifyRes = await axios.post('/api/auth/login/verify-signatures', {
        challengeId,
        signatures
      });
      if (verifyRes.data.success) {
        setTempToken(verifyRes.data.tempToken);
        if (verifyRes.data.requires2FA) {
          await axios.post('/api/auth/login/send-otp', { tempToken: verifyRes.data.tempToken });
          setStep(3);
        } else {
          login({
            accessToken: verifyRes.data.accessToken,
            refreshToken: verifyRes.data.refreshToken,
            user: verifyRes.data.user
          });
          navigate('/pages/Dashboard');
        }
      } else {
        setError(verifyRes.data.error || 'SIGNATURE_VERIFICATION_FAILED');
        setStep(1);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'SIGNATURE_VERIFICATION_FAILED');
      setStep(1);
    }
  };
  
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      setError('INVALID_OTP_FORMAT');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login/verify-otp', {
        tempToken,
        otp
      });
      login({
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        user: res.data.user
      });
      navigate('../../pages/Dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'INVALID_OTP');
    } finally {
      setLoading(false);
    }
  };
  
  const handleResendOTP = async () => {
    try {
      setLoading(true);
      await axios.post('/api/auth/login/send-otp', { tempToken });
      alert('Nouveau code OTP envoyé');
    } catch (err) {
      setError('FAILED_TO_SEND_OTP');
    } finally {
      setLoading(false);
    }
  };
  
  const handleOpenExtension = async () => {
    try {
      if (window.myWallet?.openPopup) await window.myWallet.openPopup();
      else if (chrome?.runtime?.id) window.open(`chrome-extension://${chrome.runtime.id}/popup.html`, '_blank');
      else alert('Cliquez sur l\'icône SecureCloud');
    } catch (err) {
      alert('Impossible d\'ouvrir la popup');
    }
  };

  // Rendu étape 1
  const renderStep1 = () => (
    <form onSubmit={handleSubmitCredentials} className="login-form">
      {!extensionDetected && !checkingExtension && (
        <div className="alert alert-error">
          <span className="alert-icon">⚠️</span>
          <span className="alert-text">Extension SecureCloud non détectée.</span>
          <button onClick={handleOpenExtension} className="error-action-btn">INSTALLER</button>
        </div>
      )}
      <div className="form-group">
        <label><span className="label-number">01</span>EMAIL_ADDRESS</label>
        <input type="email" name="email" placeholder="user@domain.com" value={form.email} onChange={handleChange} disabled={loading || checkingExtension} />
      </div>
      <div className="form-group">
        <label><span className="label-number">02</span>CLOUD_PASSWORD</label>
        <input type="password" name="password" placeholder="••••••••••••" value={form.password} onChange={handleChange} disabled={loading || checkingExtension} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading || checkingExtension || !extensionDetected}>
        {loading ? <><div className="spinner"></div><span>AUTHENTICATING...</span></> : checkingExtension ? <span>CHECKING_EXTENSION...</span> : <span>[ LOGIN ]</span>}
      </button>
      <div className="extension-status">
        <div className={`status-dot ${extensionDetected ? 'green' : 'red'}`}></div>
        <span className="status-text">{checkingExtension ? '// VERIFYING_EXTENSION...' : extensionDetected ? '// EXTENSION_READY' : '// EXTENSION_NOT_FOUND'}</span>
      </div>
    </form>
  );
  
  // Rendu étape 2 (multi-wallet)
  const renderStep2 = () => {
    const { challenges, threshold } = challengeData || {};
    const total = challenges?.length || 0;
    const completed = Object.values(signingStatus).filter(s => s.status === 'done').length;
    const allSigned = completed === total;
    return (
      <div className="signature-step multi-wallet">
        <div className="step-header">
          <div className="step-icon">🔐</div>
          <h3>MULTI-WALLET VERIFICATION</h3>
          <p className="step-desc">Signez avec CHAQUE wallet SecureCloud</p>
        </div>
        <div className="threshold-badge">
          <span className="threshold-label">SEUIL</span>
          <span className="threshold-value">{completed} / {total}</span>
          {allSigned && <span className="threshold-check">✓ TOUS SIGNÉS</span>}
        </div>
        <div className="wallets-list">
          {challenges?.map((challenge, idx) => {
            const status = signingStatus[challenge.walletAccountId] || { status: 'pending', message: 'En attente...' };
            return (
              <div key={challenge.walletAccountId} className={`wallet-signature-card ${status.status}`}>
                <div className="wallet-header">
                  <div className="wallet-icon">{status.status === 'done' ? '✅' : status.status === 'signing' ? '🔄' : '⏳'}</div>
                  <div className="wallet-info">
                    <div className="wallet-name">{challenge.accountName}</div>
                    <div className="wallet-type">{challenge.accountType}</div>
                    <div className="wallet-id">{challenge.walletAccountId.substring(0, 16)}...</div>
                  </div>
                  <div className="wallet-status">
                    <span className={`status-badge ${status.status}`}>
                      {status.status === 'done' ? 'SIGNÉ' : status.status === 'signing' ? 'EN COURS' : 'ATTENTE'}
                    </span>
                  </div>
                </div>
                {status.message && <div className={`signature-message ${status.status}`}>{status.message}</div>}
              </div>
            );
          })}
        </div>
        {!allSigned && (
          <div className="help-box">
            <div className="help-icon">💡</div>
            <div className="help-text">Une popup s'ouvrira pour chaque wallet. <button onClick={handleOpenExtension} className="help-link">Ouvrir l'extension</button></div>
          </div>
        )}
        {allSigned && <div className="success-box"><div className="success-icon">🎉</div><div className="success-text">Tous les wallets ont signé ! Vérification...</div></div>}
      </div>
    );
  };
  
  // Rendu étape 3 (OTP)
  const renderStep3 = () => (
    <form onSubmit={handleVerifyOTP} className="otp-form">
      <div className="step-header">
        <div className="step-icon">📧</div>
        <h3>TWO-FACTOR AUTHENTICATION</h3>
        <p className="step-desc">Code à 6 chiffres envoyé par email</p>
      </div>
      <div className="form-group">
        <label>OTP_CODE</label>
        <input type="text" placeholder="000000" maxLength="6" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} disabled={loading} className="otp-input" autoFocus />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? <><div className="spinner"></div><span>VERIFYING...</span></> : <span>[ VERIFY OTP ]</span>}
      </button>
      <button type="button" className="btn-link" onClick={handleResendOTP} disabled={loading}>Resend OTP</button>
    </form>
  );
  
  return (
    <>
      <Header />
      <div className="login-page">
        <div className="login-card">
          <div className="logo-section">
            <div className="logo-hex">
              <svg viewBox="0 0 40 40" fill="none">
                <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" stroke="#1A73E8" strokeWidth="1" fill="rgba(26,115,232,0.08)" />
                <polygon points="20,8 32,15 32,25 20,32 8,25 8,15" stroke="#0D7A5F" strokeWidth="0.5" fill="rgba(13,122,95,0.04)" />
                <text x="20" y="24" textAnchor="middle" fill="#1A73E8" fontSize="10" fontFamily="'Inter', monospace" fontWeight="bold">DS</text>
              </svg>
            </div>
            <div className="logo-text-container">
              <span className="logo-text">DRIVESECURE</span>
            </div>
          </div>
          
          <div className="progress-steps">
            <div className={`step-indicator ${step >= 1 ? 'active' : ''}`}><span className="step-num">1</span><span className="step-label">Credentials</span></div>
            <div className={`step-indicator ${step >= 2 ? 'active' : ''}`}><span className="step-num">2</span><span className="step-label">Multi-Signature</span></div>
            <div className={`step-indicator ${step >= 3 ? 'active' : ''}`}><span className="step-num">3</span><span className="step-label">2FA</span></div>
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
                {error === 'SECURECLOUD_EXTENSION_NOT_FOUND' && 'Extension SecureCloud non détectée'}
                {error === 'SIGNATURE_CANCELLED' && 'Signature annulée'}
                {error === 'INVALID_OTP_FORMAT' && 'Code OTP = 6 chiffres'}
                {error === 'INVALID_OTP' && 'Code OTP invalide'}
                {error === 'LOGIN_FAILED' && 'Email ou mot de passe incorrect'}
                {!['ALL_FIELDS_REQUIRED','SECURECLOUD_EXTENSION_NOT_FOUND','SIGNATURE_CANCELLED','INVALID_OTP_FORMAT','INVALID_OTP','LOGIN_FAILED'].includes(error) && error}
              </span>
              {error === 'SECURECLOUD_EXTENSION_NOT_FOUND' && <button onClick={handleOpenExtension} className="error-action-btn">INSTALLER</button>}
            </div>
          )}
          
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          
          <div className="login-footer">
            <a href="/register" className="register-link">[ NO_ACCOUNT? REGISTER ]</a>
          </div>
        </div>
      </div>
    </>
  );
}