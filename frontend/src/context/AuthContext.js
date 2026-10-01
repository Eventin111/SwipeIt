import React, { createContext, useState, useEffect } from 'react';
import { appConfig } from '../config/appConfig';
import { initializeAuthSession } from '../core/application/usecases/initializeAuthSession';
import { loginUser } from '../core/application/usecases/loginUser';
import { logoutUser } from '../core/application/usecases/logoutUser';
import { registerUser } from '../core/application/usecases/registerUser';
import { createBackendAuthRepository } from '../core/infrastructure/repositories/backendAuthRepository';

const AuthContext = createContext();
const authRepository = createBackendAuthRepository();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const authKeys = appConfig.authStorageKeys;

  useEffect(() => {
    const initAuth = async () => {
      try {
        const session = await initializeAuthSession(authRepository);

        if (session.user) {
          setUser(session.user);
          setIsAuthenticated(true);
        }
      } catch (err) {
        setAuthError(err.message || 'Не удалось проверить вход. Проверьте соединение и повторите попытку.');
      } finally {
        setTimeout(() => {
          setLoading(false);
        }, appConfig.authInitDelayMs);
      }
    };

    void initAuth();
  }, []);

  const clearAuth = () => {
    authRepository.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  const login = async (email, password) => {
    const session = await loginUser(authRepository, { email, password });
    setUser(session.user);
    setIsAuthenticated(true);
    return session.user;
  };

  const logout = async () => {
    await logoutUser(authRepository);
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  };

  const register = async (email, password, username) => {
    const session = await registerUser(authRepository, { email, password, username });
    setUser(session.user);
    setIsAuthenticated(true);
    return session.user;
  };

  const updateUserProfile = async (partialUser) => {
    if (!user) {
      return null;
    }

    const nextUser = await authRepository.updateProfile({ ...user, ...partialUser });
    setUser(nextUser);
    localStorage.setItem(authKeys.user, JSON.stringify(nextUser));
    return nextUser;
  };

  const previewUserProfile = (partialUser) => {
    if (!user) {
      return null;
    }

    const nextUser = { ...user, ...partialUser };
    setUser(nextUser);
    localStorage.setItem(authKeys.user, JSON.stringify(nextUser));
    return nextUser;
  };

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      user, 
      loading, 
      login, 
      logout, 
      register,
      clearAuth,
      updateUserProfile,
      previewUserProfile
    }}>
      {authError ? <div role="alert" className="tryon-alert tryon-alert--error">
        <p>{authError}</p>
        <button onClick={() => window.location.reload()}>Повторить</button>
      </div> : children}
    </AuthContext.Provider>
  );
};

export { AuthContext };
