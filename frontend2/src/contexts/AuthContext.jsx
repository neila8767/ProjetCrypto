// contexts/AuthContext.jsx (renomme le fichier en .jsx si tu utilises du JSX)
import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Vérifier si l'utilisateur est déjà connecté (localStorage)
    const storedAccessToken = localStorage.getItem('accessToken');
    const storedRefreshToken = localStorage.getItem('refreshToken');
    const storedUser = localStorage.getItem('user');
    
    if (storedAccessToken && storedRefreshToken && storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
        setIsAuthenticated(true);
        
        // Configurer axios
        axios.defaults.headers.common['Authorization'] = `Bearer ${storedAccessToken}`;
        
        console.log('✅ [AUTH] Utilisateur reconnecté:', userData.email);
      } catch (err) {
        console.error('❌ [AUTH] Erreur chargement session:', err);
        logout();
      }
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (authData) => {
    console.log('🔐 [AUTH] Connexion utilisateur:', authData.user?.email);
    
    setUser(authData.user);
    setAccessToken(authData.accessToken);
    setRefreshToken(authData.refreshToken);
    setIsAuthenticated(true);
    
    // Stocker dans localStorage
    localStorage.setItem('accessToken', authData.accessToken);
    localStorage.setItem('refreshToken', authData.refreshToken);
    localStorage.setItem('user', JSON.stringify(authData.user));
    
    // Configurer axios
    axios.defaults.headers.common['Authorization'] = `Bearer ${authData.accessToken}`;
  };

  const logout = () => {
    console.log('🚪 [AUTH] Déconnexion');
    
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setIsAuthenticated(false);
    
    // Nettoyer localStorage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    // Nettoyer axios
    delete axios.defaults.headers.common['Authorization'];
  };

  const refreshAccessToken = async () => {
    if (!refreshToken) return null;
    
    try {
      const response = await axios.post('/api/auth/login/refresh', { refreshToken });
      const newAccessToken = response.data.accessToken;
      
      setAccessToken(newAccessToken);
      localStorage.setItem('accessToken', newAccessToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
      
      return newAccessToken;
    } catch (err) {
      console.error('❌ [AUTH] Erreur refresh token:', err);
      logout();
      return null;
    }
  };

  const value = {
    user,
    accessToken,
    refreshToken,
    isAuthenticated,
    loading,
    login,
    logout,
    refreshAccessToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};