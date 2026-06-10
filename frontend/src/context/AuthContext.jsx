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
      setRole(null);
      setTrainee(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    // ensure admin user is set up server-side on initial load (idempotent)
    axios.post(`${BASE}/setup/init`).catch(() => {});
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
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
    await supabase.auth.signOut();
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
