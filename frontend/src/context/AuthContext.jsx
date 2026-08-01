/**
 * AuthContext
 * Global authentication state - user object, token, login/logout.
 * Supports either session-only or remembered auth persistence.
 */
import { createContext, useContext, useState, useCallback, useEffect } from "react";

const AUTH_TOKEN_KEY = "auth_token";
const AUTH_REFRESH_KEY = "auth_refresh_token";
const AUTH_USER_KEY = "auth_user";

const AuthContext = createContext(null);

function readStoredJson(key, fallback = null) {
  try {
    const sessionValue = sessionStorage.getItem(key);
    if (sessionValue) return JSON.parse(sessionValue);
    const localValue = localStorage.getItem(key);
    return localValue ? JSON.parse(localValue) : fallback;
  } catch {
    return fallback;
  }
}

function readStoredString(key) {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function hasStoredValue(storage, key) {
  try {
    return Boolean(storage.getItem(key));
  } catch {
    return false;
  }
}

function getAuthStorage() {
  if (hasStoredValue(sessionStorage, AUTH_TOKEN_KEY)) return sessionStorage;
  if (hasStoredValue(localStorage, AUTH_TOKEN_KEY)) return localStorage;
  return localStorage;
}

function removeFromAllStorages(key) {
  try { localStorage.removeItem(key); } catch {}
  try { sessionStorage.removeItem(key); } catch {}
}

function writeStoredString(key, value, persist) {
  const target = persist ? localStorage : sessionStorage;
  const other = persist ? sessionStorage : localStorage;

  try { other.removeItem(key); } catch {}
  try {
    if (value === null || value === undefined || value === "") {
      target.removeItem(key);
    } else {
      target.setItem(key, value);
    }
  } catch {}
}

function writeStoredJson(key, value, persist) {
  if (value === null || value === undefined) {
    writeStoredString(key, null, persist);
    return;
  }
  writeStoredString(key, JSON.stringify(value), persist);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredJson(AUTH_USER_KEY));
  const [token, setToken] = useState(() => readStoredString(AUTH_TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState(() => readStoredString(AUTH_REFRESH_KEY));

  const login = useCallback((userData, accessToken, newRefreshToken = "", persist = false) => {
    setUser(userData);
    setToken(accessToken);
    setRefreshToken(newRefreshToken);
    writeStoredString(AUTH_TOKEN_KEY, accessToken, persist);
    writeStoredJson(AUTH_USER_KEY, userData, persist);
    writeStoredString(AUTH_REFRESH_KEY, newRefreshToken, persist);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    removeFromAllStorages(AUTH_TOKEN_KEY);
    removeFromAllStorages(AUTH_REFRESH_KEY);
    removeFromAllStorages(AUTH_USER_KEY);
  }, []);

  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("auth:logout", handler);
    return () => window.removeEventListener("auth:logout", handler);
  }, [logout]);

  // Sync React state when api.js silently refreshes tokens
  useEffect(() => {
    const handler = (e) => {
      const { access_token, refresh_token } = e.detail || {};
      if (access_token) {
        setToken(access_token);
        setRefreshToken(refresh_token || "");
      }
    };
    window.addEventListener("auth:tokens-refreshed", handler);
    return () => window.removeEventListener("auth:tokens-refreshed", handler);
  }, []);

  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      const next = { ...prev, ...partial };
      const persist = getAuthStorage() === localStorage;
      writeStoredJson(AUTH_USER_KEY, next, persist);
      return next;
    });
  }, []);

  const updateTokens = useCallback((newAccess, newRefresh) => {
    setToken(newAccess);
    setRefreshToken(newRefresh);
    const persist = getAuthStorage() === localStorage;
    writeStoredString(AUTH_TOKEN_KEY, newAccess, persist);
    writeStoredString(AUTH_REFRESH_KEY, newRefresh, persist);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        refreshToken,
        login,
        logout,
        updateUser,
        updateTokens,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
