import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { appApi } from "@/api/app-api";
import { clearRuntimeAccessToken } from "@/lib/runtime-config";
import { SESSION_LAST_ACTIVITY_STORAGE_KEY } from "@/lib/auth-storage";

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL = 60 * 1000; // Check every 1 minute

function updateLastActivity() {
  localStorage.setItem(
    SESSION_LAST_ACTIVITY_STORAGE_KEY,
    Date.now().toString()
  );
}

export function useSessionGuard() {
  const navigate = useNavigate();
  const sessionRecoveryStarted = useRef(false);

  useEffect(() => {
    const recoverToLogin = () => {
      if (sessionRecoveryStarted.current) {
        return;
      }
      sessionRecoveryStarted.current = true;
      clearRuntimeAccessToken();
      navigate("/login", { replace: true });
    };

    const verifySession = async () => {
      try {
        const me = await appApi.auth.me();
        if (!me || me.is_active === false) {
          recoverToLogin();
        }
      } catch (error) {
        const status = error?.status;
        if (status === 401 || status === 403) {
          recoverToLogin();
          return;
        }
        console.warn("[session-guard] session check failed", error);
      }
    };

    updateLastActivity();
    verifySession();

    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart", "click"];
    const handleActivity = () => {
      if (document.visibilityState !== "hidden") {
        updateLastActivity();
      }
    };

    activityEvents.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    const checkInactivity = () => {
      const lastActivity = localStorage.getItem(SESSION_LAST_ACTIVITY_STORAGE_KEY);
      if (!lastActivity) {
        updateLastActivity();
        return;
      }

      const timeSinceActivity = Date.now() - parseInt(lastActivity, 10);
      if (timeSinceActivity > INACTIVITY_TIMEOUT) {
        clearRuntimeAccessToken();
        navigate("/login", { replace: true });
      }
    };

    const inactivityInterval = setInterval(checkInactivity, CHECK_INTERVAL);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkInactivity();
        updateLastActivity();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      activityEvents.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      clearInterval(inactivityInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [navigate]);
}
