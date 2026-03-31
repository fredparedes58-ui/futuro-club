/**
 * VITAS — AuthContext
 * Gestiona sesión de Supabase. Wrappea toda la app.
 *
 * Si Supabase no está configurado (VITE_SUPABASE_URL faltante),
 * opera en modo offline: usuario simulado para no bloquear el dev.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
}

interface AuthActions {
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
}

type AuthContextValue = AuthState & AuthActions;

// ─── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) {
      // Modo offline: usuario demo para no bloquear dev
      setUser(null);
      setSession(null);
      setLoading(false);
      return;
    }

    // Carga sesión inicial
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // Escucha cambios de sesión
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    if (!SUPABASE_CONFIGURED) {
      return { error: { message: "Supabase no configurado — agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY" } as AuthError };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    if (!SUPABASE_CONFIGURED) {
      return { error: { message: "Supabase no configurado" } as AuthError };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName ?? email.split("@")[0] },
      },
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    if (!SUPABASE_CONFIGURED) return;
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!SUPABASE_CONFIGURED) {
      return { error: { message: "Supabase no configurado" } as AuthError };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        configured: SUPABASE_CONFIGURED,
        signIn,
        signUp,
        signOut,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

// Helper para obtener el display name del usuario
export function getUserDisplayName(user: User | null): string {
  if (!user) return "Invitado";
  return (
    user.user_metadata?.display_name ||
    user.email?.split("@")[0] ||
    "Scout"
  );
}

export function getUserInitials(user: User | null): string {
  const name = getUserDisplayName(user);
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
