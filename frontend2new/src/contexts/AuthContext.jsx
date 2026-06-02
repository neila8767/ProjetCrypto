import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

export const AuthContext =
  createContext();

export const useAuth = () => {

  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within AuthProvider'
    );
  }

  return context;
};

export const AuthProvider = ({
  children,
}) => {

  const [user, setUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [isAuthenticated,
    setIsAuthenticated] =
    useState(false);


  // ======================
  // LOAD SESSION
  // ======================

  useEffect(() => {

    const storedUser =
      localStorage.getItem('user');

    const storedAccessToken =
      localStorage.getItem('accessToken');

    const storedRefreshToken =
      localStorage.getItem('refreshToken');

    if (
      storedUser &&
      storedAccessToken &&
      storedRefreshToken
    ) {

      try {

        const parsedUser =
          JSON.parse(storedUser);

        setUser(parsedUser);

        setIsAuthenticated(true);

        console.log(
          '✅ Session restaurée'
        );

      } catch (err) {

        console.error(
          '❌ Erreur session',
          err
        );

        logout();
      }
    }

    setLoading(false);

  }, []);


  // ======================
  // LOGIN
  // ======================

  const login = (authData) => {

    console.log(
      '🔐 Connexion:',
      authData.user?.email
    );

    setUser(authData.user);

    setIsAuthenticated(true);

    // SAVE STORAGE
    localStorage.setItem(
      'accessToken',
      authData.accessToken
    );

    localStorage.setItem(
      'refreshToken',
      authData.refreshToken
    );

    localStorage.setItem(
      'user',
      JSON.stringify(authData.user)
    );
  };


  // ======================
  // LOGOUT
  // ======================

  const logout = () => {

    console.log('🚪 Déconnexion');

    setUser(null);

    setIsAuthenticated(false);

    localStorage.removeItem(
      'accessToken'
    );

    localStorage.removeItem(
      'refreshToken'
    );

    localStorage.removeItem(
      'user'
    );

    window.location.href = '/login';
  };


  return (

    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated,
        login,
        logout,
      }}
    >

      {children}

    </AuthContext.Provider>
  );
};