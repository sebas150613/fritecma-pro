import React, { createContext, useContext, useEffect, useState } from "react";
import { appApi } from "@/api/app-api";
import { publicAppApi } from "@/api/public-app-api";
import { getStoredAuthToken, runtimeConfig } from "@/lib/runtime-config";

const AppAuthContext = createContext();

export const AppAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const applyDark = (e) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };

    applyDark(mq);
    mq.addEventListener("change", applyDark);

    return () => mq.removeEventListener("change", applyDark);
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      try {
        const publicSettings = await publicAppApi.getPublicSettings(
          runtimeConfig.appId
        );
        setAppPublicSettings(publicSettings);

        if (getStoredAuthToken()) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }

        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error("App state check failed:", appError);

        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;

          if (reason === "auth_required") {
            setAuthError({
              type: "auth_required",
              message: "Authentication required",
            });
          } else if (reason === "user_not_registered") {
            setAuthError({
              type: "user_not_registered",
              message: "User not registered for this app",
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message,
            });
          }
        } else {
          setAuthError({
            type: "unknown",
            message: appError.message || "Failed to load app",
          });
        }

        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      setAuthError({
        type: "unknown",
        message: error.message || "An unexpected error occurred",
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await appApi.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error("User auth check failed:", error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);

      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: "auth_required",
          message: "Authentication required",
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);

    if (shouldRedirect) {
      appApi.auth.logout(window.location.href);
    } else {
      appApi.auth.logout();
    }
  };

  const navigateToLogin = () => {
    appApi.auth.redirectToLogin(window.location.href);
  };

  return (
    <AppAuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AppAuthContext.Provider>
  );
};

export const useAppAuth = () => {
  const context = useContext(AppAuthContext);

  if (!context) {
    throw new Error("useAppAuth must be used within an AppAuthProvider");
  }

  return context;
};

export const AuthProvider = AppAuthProvider;
export const useAuth = useAppAuth;

