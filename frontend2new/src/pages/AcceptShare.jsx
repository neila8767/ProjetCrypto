// frontend/src/pages/AcceptShare.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const AcceptShare = () => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const acceptShare = async () => {
      try {
        const token = searchParams.get('token');
        const ownerKeyId = searchParams.get('ownerKeyId');
        const recipientKeyId = searchParams.get('recipientKeyId');
        const fileId = searchParams.get('fileId');

        console.log('🔗 Acceptation du partage:', { token, ownerKeyId, recipientKeyId, fileId });

        // Récupérer le token d'authentification stocké
        const authToken = localStorage.getItem('accessToken');
        
        if (!authToken) {
          // Pas de token => rediriger vers login
          console.log('❌ Pas de token, redirection vers login');
          localStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search);
          navigate('/login');
          return;
        }

        // Appeler l'API backend
        const response = await axios.get(
          `http://localhost:3000/api/share/accept/${token}`,
          {
            params: { ownerKeyId, recipientKeyId, fileId },
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          }
        );

        if (response.data.success) {
          console.log('✅ Partage accepté avec succès');
          setFileInfo(response.data.file);
          setLoading(false);
          // Optionnel: rediriger après 3 secondes
          setTimeout(() => {
            navigate('/dashboard');
          }, 3000);
        }
      } catch (err) {
        console.error('❌ Erreur:', err);
        setError(err.response?.data?.message || 'Erreur lors de l\'acceptation');
        setLoading(false);
      }
    };

    acceptShare();
  }, [searchParams, navigate]);

  if (loading) {
    return <div>⏳ Acceptation du partage en cours...</div>;
  }

  if (error) {
    return (
      <div style={{ color: 'red' }}>
        <h3>❌ Erreur</h3>
        <p>{error}</p>
        <button onClick={() => window.location.href = '/login'}>
          Se connecter
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h2>✅ Partage accepté avec succès !</h2>
      {fileInfo && (
        <div>
          <p>Fichier: <strong>{fileInfo.filename}</strong></p>
          <p>Partagé par: <strong>{fileInfo.owner_email}</strong></p>
          <p>Vous allez être redirigé vers votre espace...</p>
        </div>
      )}
    </div>
  );
};

export default AcceptShare;