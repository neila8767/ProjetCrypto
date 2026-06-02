import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});


// ======================
// REQUEST INTERCEPTOR
// ======================

api.interceptors.request.use(
  (config) => {

    const token = localStorage.getItem('accessToken');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },

  (error) => Promise.reject(error)
);


// ======================
// RESPONSE INTERCEPTOR
// ======================

api.interceptors.response.use(

  (response) => response,

  async (error) => {

    const originalRequest = error.config;

    // TOKEN EXPIRE
    if (
      error.response?.status === 401 &&
      !originalRequest._retry
    ) {

      originalRequest._retry = true;

      try {

        const refreshToken =
          localStorage.getItem('refreshToken');

        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        console.log('🔄 Refresh token en cours...');

        // APPEL REFRESH TOKEN
        const response = await axios.post(
          `${API_URL}/auth/login/refresh`,
          {
            refreshToken,
          }
        );

        const newAccessToken =
          response.data.accessToken;

        console.log('✅ Nouveau access token reçu');

        // SAVE NEW TOKEN
        localStorage.setItem(
          'accessToken',
          newAccessToken
        );

        // UPDATE HEADERS
        api.defaults.headers.common[
          'Authorization'
        ] = `Bearer ${newAccessToken}`;

        originalRequest.headers[
          'Authorization'
        ] = `Bearer ${newAccessToken}`;

        // REFAIRE LA REQUETE
        return api(originalRequest);

      } catch (refreshError) {

        console.error(
          '❌ Refresh token invalide',
          refreshError
        );

        // CLEAN STORAGE
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');

        // REDIRECT LOGIN
        window.location.href = '/login';

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;