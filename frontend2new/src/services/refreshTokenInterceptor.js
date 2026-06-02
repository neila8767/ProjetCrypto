// services/refreshTokenInterceptor.js
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export const refreshTokenInterceptor = (axiosInstance) => {
  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      
      // Éviter les boucles infinies
      if (originalRequest._retry) {
        return Promise.reject(error);
      }
      
      // Vérifier si c'est une erreur 401 (Unauthorized)
      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // Si un refresh est déjà en cours, mettre en file d'attente
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then(token => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return axiosInstance(originalRequest);
            })
            .catch(err => Promise.reject(err));
        }
        
        originalRequest._retry = true;
        isRefreshing = true;
        
        try {
          const refreshToken = localStorage.getItem('refreshToken');
          
          if (!refreshToken) {
            throw new Error('No refresh token available');
          }
          
          // Appeler l'API de rafraîchissement
          const response = await axios.post(
            `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/auth/refresh`,
            { refreshToken }
          );
          
          const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;
          
          // Mettre à jour les tokens
          localStorage.setItem('accessToken', newAccessToken);
          localStorage.setItem('refreshToken', newRefreshToken);
          
          // Mettre à jour le header par défaut
          axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
          
          // Traiter la file d'attente
          processQueue(null, newAccessToken);
          
          // Réessayer la requête originale
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return axiosInstance(originalRequest);
          
        } catch (refreshError) {
          // Si le refresh échoue, déconnecter l'utilisateur
          processQueue(refreshError, null);
          
          // Nettoyer les tokens
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          
          // Rediriger vers la page de connexion
          window.location.href = '/login';
          
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
      
      return Promise.reject(error);
    }
  );
};