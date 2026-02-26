import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types';
import { isManagement, isLeadership, isAdminLevel } from '../lib/roles';

let authSubscription: { unsubscribe: () => void } | null = null;
let isInitializing = false;

interface AuthState {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, inviteCode: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;

  hasRole: (...roles: UserRole[]) => boolean;
  isAdminOrOwner: () => boolean;
  isManagement: () => boolean;
  isLeadership: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    if (isInitializing) return;
    isInitializing = true;

    if (authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        set({
          user: { id: session.user.id, email: session.user.email ?? '' },
          profile: profile as Profile | null,
          initialized: true,
        });
      } else {
        set({ user: null, profile: null, initialized: true });
      }
    } catch (err) {
      console.error('Auth init failed:', err);
      set({ user: null, profile: null, initialized: true });
    } finally {
      isInitializing = false;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession?.user) return;
        set({ user: null, profile: null });
        return;
      }

      if (!session?.user) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        set(state => ({
          user: { id: session.user.id, email: session.user.email ?? '' },
          // If the fetch returned null (race condition with auth token),
          // keep the existing profile if it belongs to the same user.
          profile: (profile as Profile | null) ??
            (state.profile?.id === session.user.id ? state.profile : null),
        }));
      }
    });
    authSubscription = subscription;
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false });
      throw error;
    }

    if (data.session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .single();

      set({
        user: { id: data.session.user.id, email: data.session.user.email ?? '' },
        profile: profile as Profile | null,
        loading: false,
      });
    } else {
      set({ loading: false });
    }
  },

  signUp: async (email: string, password: string, fullName: string, inviteCode: string) => {
    set({ loading: true });
    try {
      const { data: valid, error: checkErr } = await supabase.rpc('validate_invite_code', {
        invite_code: inviteCode,
      });
      if (checkErr) throw checkErr;
      if (!valid) throw new Error('Invalid or already used invite code.');

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;

      if (data.user) {
        const { error: inviteErr } = await supabase.rpc('signup_with_invite', {
          invite_code: inviteCode,
          for_user_id: data.user.id,
        });
        if (inviteErr) {
          console.warn('Invite code marking failed:', inviteErr.message);
        }
      }
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    set({ user: null, profile: null });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) {
      console.error('Profile refresh failed:', error);
      return;
    }
    set({ profile: profile as Profile | null });
  },

  hasRole: (...roles: UserRole[]) => {
    const { profile } = get();
    return profile ? roles.includes(profile.role) : false;
  },

  isAdminOrOwner: () => {
    const { profile } = get();
    return profile ? isAdminLevel(profile.role) : false;
  },

  isManagement: () => {
    const { profile } = get();
    return profile ? isManagement(profile.role) : false;
  },

  isLeadership: () => {
    const { profile } = get();
    return profile ? isLeadership(profile.role) : false;
  },
}));
