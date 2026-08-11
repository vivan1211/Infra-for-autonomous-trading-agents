"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  live_enabled: boolean;
  is_approved: boolean;
  completed_walkthrough: boolean;
  trades_public: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string; mfaRequired?: boolean }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithProvider: (provider: "x") => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  verifyMFA: (factorId: string, code: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  profileLoading: true,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signInWithProvider: async () => ({}),
  signOut: async () => {},
  refreshProfile: async () => {},
  verifyMFA: async () => ({}),
});

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  // Fetch user profile from user_profiles table
  const profileRef = useRef<UserProfile | null>(null);
  const fetchProfile = useCallback(
    async (userId: string) => {
      // Only show loading spinner on initial fetch, not on background re-fetches
      // (e.g. token refresh when switching tabs). This prevents unmounting the whole app.
      setProfileLoading((prev) => profileRef.current === null ? true : prev);
      try {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("id, display_name, avatar_url, onboarding_completed, live_enabled, is_approved, completed_walkthrough, trades_public")
          .eq("id", userId)
          .single();

        if (!error && data) {
          const p = data as UserProfile;
          profileRef.current = p;
          setProfile(p);
        } else {
          profileRef.current = null;
          setProfile(null);
        }
      } catch {
        profileRef.current = null;
        setProfile(null);
      }
      setProfileLoading(false);
    },
    [supabase]
  );

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  }, [session, fetchProfile]);

  useEffect(() => {
    // Handle PKCE code exchange from email confirmation
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ data, error }: { data: { session: Session | null }; error: unknown }) => {
          if (!error && data.session) {
            setSession(data.session);
            // Clean up URL
            window.history.replaceState({}, "", window.location.pathname);
          }
          setLoading(false);
        });
    } else {
      // Get initial session
      supabase.auth
        .getSession()
        .then(({ data: { session: s } }: { data: { session: Session | null } }) => {
          setSession(s);
          setLoading(false);
        });
    }

    // Listen for auth changes — only update session when user actually changes,
    // not on routine token refreshes (which cause unnecessary re-renders/unmounts)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, s: Session | null) => {
      if (event === 'TOKEN_REFRESHED') {
        // Silently update session reference without triggering profile re-fetch
        setSession((prev) => {
          if (prev?.user?.id === s?.user?.id) return prev; // same user, keep old ref
          return s;
        });
      } else {
        setSession(s);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Fetch profile whenever session changes
  useEffect(() => {
    if (session?.user?.id) {
      fetchProfile(session.user.id);
    } else {
      setProfile(null);
      setProfileLoading(false);
    }
  }, [session, fetchProfile]);

  // Idle timeout: sign out after 30 min of inactivity
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!session) return;

    const resetTimer = () => { lastActivityRef.current = Date.now(); };

    // Throttle to once per second
    let throttled = false;
    const throttledReset = () => {
      if (throttled) return;
      throttled = true;
      resetTimer();
      setTimeout(() => { throttled = false; }, 1000);
    };

    window.addEventListener('mousemove', throttledReset);
    window.addEventListener('keydown', throttledReset);
    window.addEventListener('click', throttledReset);
    window.addEventListener('scroll', throttledReset);

    // Reset timer when user returns to tab (prevents sign-out on tab switch)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') resetTimer();
    };
    const handleFocus = () => resetTimer();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    const interval = setInterval(() => {
      // Only check idle when tab is visible — don't sign out background tabs
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastActivityRef.current > IDLE_TIMEOUT_MS) {
        import('swr').then(({ mutate }) => {
          mutate(() => true, undefined, { revalidate: false });
          supabase.auth.signOut().finally(() => {
            window.location.href = '/login';
          });
        });
      }
    }, 60_000); // Check every minute

    return () => {
      window.removeEventListener('mousemove', throttledReset);
      window.removeEventListener('keydown', throttledReset);
      window.removeEventListener('click', throttledReset);
      window.removeEventListener('scroll', throttledReset);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [session, supabase]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
      // Set session immediately — don't wait for onAuthStateChange
      if (data.session) setSession(data.session);

      // Check if MFA is required (user has enrolled TOTP factors)
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData && aalData.currentLevel === "aal1" && aalData.nextLevel === "aal2") {
        return { mfaRequired: true };
      }

      return {};
    },
    [supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) return { error: error.message };
      return {};
    },
    [supabase]
  );

  const signInWithProvider = useCallback(
    async (provider: "x") => {
      // Supabase OAuth 2.0 provider for X/Twitter uses provider name 'x'
      // (not 'twitter' which is the deprecated OAuth 1.0a version)
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) return { error: error.message };
      return {};
    },
    [supabase]
  );

  const verifyMFA = useCallback(
    async (factorId: string, code: string) => {
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) return { error: challengeError.message };

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) return { error: verifyError.message };

      // Refresh session after MFA verification to get aal2 token
      const { data: { session: newSession } } = await supabase.auth.refreshSession();
      if (newSession) setSession(newSession);

      return {};
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    // Clear SWR cache BEFORE sign-out to prevent stale data leak to next user
    const { mutate } = await import('swr');
    await mutate(() => true, undefined, { revalidate: false });
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    // Hard reload to guarantee clean state — client-side navigation preserves module-level SWR cache
    window.location.href = '/login';
  }, [supabase]);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      loading,
      profileLoading,
      signIn,
      signUp,
      signInWithProvider,
      signOut,
      refreshProfile,
      verifyMFA,
    }),
    [session, profile, loading, profileLoading, signIn, signUp, signInWithProvider, signOut, refreshProfile, verifyMFA]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
