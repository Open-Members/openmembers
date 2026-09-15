'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from './client';

export type UserRole = 'user' | 'admin' | 'super_admin';
export type UserStatus = 'active' | 'suspended';

interface UserCtx {
  user: User | null;
  userId: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string | null;
  loading: boolean;
  refreshAvatar: () => Promise<void>;
}

const Ctx = createContext<UserCtx>({ user: null, userId: '', role: 'user', status: 'suspended', avatarUrl: null, loading: true, refreshAvatar: async () => {} });

function ProfileProvider({ user, sessionLoading, children }: {
  user: User | null;
  sessionLoading: boolean;
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<{ role: UserRole; status: UserStatus; avatarUrl: string | null } | null>(null);
  const [profileLoading, setProfileLoading] = useState(Boolean(user));
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    if (!user) return;
    const supabase = createClient();
    const profileUser = user;
    async function loadProfile() {
      try {
        const { data, error } = await supabase.from('profiles')
          .select('role, status, avatar_url').eq('id', profileUser.id).single();
        if (generation.current !== current) return;
        setProfile(!error && data ? {
          role: data.role === 'admin' || data.role === 'super_admin' ? data.role : 'user',
          status: data.status === 'active' ? 'active' : 'suspended',
          avatarUrl: data.avatar_url || profileUser.user_metadata?.avatar_url || profileUser.user_metadata?.picture || null,
        } : null);
      } catch {
        if (generation.current === current) setProfile(null);
      } finally {
        if (generation.current === current) setProfileLoading(false);
      }
    }
    void loadProfile();
    return () => { generation.current += 1; };
  }, [user]);

  const refreshAvatar = useMemo(() => async () => {
    if (!user) return;
    const current = generation.current;
    const { data, error } = await createClient().from('profiles').select('avatar_url').eq('id', user.id).single();
    if (!error && data && generation.current === current) {
      setProfile((previous) => previous ? { ...previous, avatarUrl: data.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null } : null);
    }
  }, [user]);

  const value = useMemo(() => ({
    user, userId: user?.id ?? '', role: profile?.role ?? 'user', status: profile?.status ?? 'suspended',
    avatarUrl: profile?.avatarUrl ?? null, loading: sessionLoading || profileLoading, refreshAvatar,
  }), [user, profile, sessionLoading, profileLoading, refreshAvatar]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function UserProvider({ children, initialUser = null }: { children: React.ReactNode; initialUser?: User | null }) {
  // Keep the page mounted when the browser confirms the server-verified identity.
  const [session, setSession] = useState<{ user: User | null; loading: boolean }>({ user: initialUser, loading: true });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let authEventReceived = false;
    // Keep the Auth callback synchronous. Profile queries happen in the child
    // effect, outside the client's Auth event lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true;
      if (!cancelled) setSession({ user: nextSession?.user ?? null, loading: false });
    });
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!cancelled && !authEventReceived) setSession({ user: error ? null : data.user, loading: false });
    }).catch(() => {
      if (!cancelled && !authEventReceived) setSession({ user: null, loading: false });
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  // A different identity gets new profile state immediately, including logout.
  return <ProfileProvider key={session.user?.id ?? 'anonymous'} user={session.user} sessionLoading={session.loading}>{children}</ProfileProvider>;
}

export function useUser() {
  return useContext(Ctx);
}
