import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

// Checks every 60 minutes if the user is still active.
// Also exposes a manual check function for important navigation events.
const POLL_INTERVAL = 60 * 60 * 1000; // 60 minutes

async function checkSession() {
  try {
    const me = await base44.auth.me();
    if (!me || me.is_active === false) {
      base44.auth.logout("/");
    }
  } catch {
    // If the request fails (user deleted), force logout
    base44.auth.logout("/");
  }
}

export function useSessionGuard() {
  useEffect(() => {
    // Check immediately on mount
    checkSession();

    // Poll every 60 minutes
    const interval = setInterval(checkSession, POLL_INTERVAL);

    // Also check on tab visibility change (user switches back to the app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkSession();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}

export { checkSession };