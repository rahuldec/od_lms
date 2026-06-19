import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import axios from "axios";
import { supabase, usernameToEmail } from "@/lib/supabaseClient";

const AuthContext = createContext(null);
const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [trainee, setTrainee] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async (token) => {
    if (!token) {
      setRole(null);
      setTrainee(null);
      return;
    }
    try {
      const { data } = await axios.get(`${BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRole(data.role);
      setTrainee(data.trainee);
    } catch (e) {
      if (e?.response?.status !== 401) {
        // Non-auth error (network blip, 500, backend cold-start, etc).
        // Don't sign the user out for this - just clear stale data and
        // let the next successful call repopulate it.
        setRole(null);
        setTrainee(null);
        return;
      }

      // 401: token might just be stale (e.g. tab was backgrounded and the
      // browser throttled the auto-refresh timer). Try one explicit
      // refresh before giving up.
      let refreshed = null;
      try {
        const { data: refreshData, error: refreshErr } =
          await supabase.auth.refreshSession();
        if (!refreshErr && refreshData?.session?.access_token) {
          refreshed = refreshData.session;
        }
      } catch (refreshCatchErr) {
        refreshed = null;
      }

      if (refreshed) {
        try {
          const { data } = await axios.get(`${BASE}/me`, {
            headers: { Authorization: `Bearer ${refreshed.access_token}` },
          });
          setSession(refreshed);
          setRole(data.role);
          setTrainee(data.trainee);
          return; // recovered - do not sign out
        } catch (retryErr) {
          // retry also failed - fall through to sign-out below
        }
      }

      // Refresh failed or retry still failed - session is genuinely dead.
      setRole(null);
      setTrainee(null);
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch (signOutErr) {
        await supabase.auth.signOut();
      }
      try {
        localStorage.removeItem("odk-training-auth");
      } catch (storageErr) {}
      setSession(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      // Bootstrap admin once on initial load (idempotent server-side, but skip if already logged in)
      if (!data.session) {
        axios.post(`${BASE}/setup/init`).catch(() => {});
      }
      await refreshMe(data.session?.access_token);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      await refreshMe(s?.access_token);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshMe]);

  // Proactively re-sync the session when the tab regains focus. This is
  // what actually prevents the 401 in most cases: getSession() will
  // auto-refresh an expired/near-expired token, so by the time any API
  // call fires after the trainee switches back to this tab, the token
  // is already fresh.
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === "visible") {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setSession(data.session);
          await refreshMe(data.session.access_token);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [refreshMe]);

  const signInAs = async ({ username, password, roleHint }) => {
    const email = usernameToEmail(username, roleHint);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error };
    return { data };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (e) {
      await supabase.auth.signOut();
    }
    try {
      localStorage.removeItem("odk-training-auth");
    } catch (e) {}
    setSession(null);
    setRole(null);
    setTrainee(null);
  };

  return (
    <AuthContext.Provider
      value={{ session, role, trainee, loading, signInAs, signOut, refreshMe }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
