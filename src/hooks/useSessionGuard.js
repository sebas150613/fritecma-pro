import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL = 60 * 1000; // Check every 1 minute
const LAST_ACTIVITY_KEY = 'fritecma_last_activity';

function updateLastActivity() {
  localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
}

async function checkSession() {
  try {
    const me = await base44.auth.me();
    if (!me || me.is_active === false) {
      base44.auth.logout("/");
    }
  } catch {
    base44.auth.logout("/");
  }
}

function checkInactivity() {
  const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!lastActivity) return;
  
  const timeSinceActivity = Date.now() - parseInt(lastActivity, 10);
  if (timeSinceActivity > INACTIVITY_TIMEOUT) {
    base44.auth.logout("/");
  }
}

export function useSessionGuard() {
  useEffect(() => {
    // Initialize last activity
    updateLastActivity();
    checkSession();

    // Track user activity
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => updateLastActivity();
    
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Check inactivity every minute
    const inactivityInterval = setInterval(checkInactivity, CHECK_INTERVAL);

    // Also check when user returns to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkInactivity();
        updateLastActivity();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      clearInterval(inactivityInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}

export { checkSession };