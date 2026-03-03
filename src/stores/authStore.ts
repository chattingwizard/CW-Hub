import { create } from 'zustand';
import { supabase, fetchProfileWithRetry } from '../lib/supabase';
import type { Profile, UserRole } from '../types';
import { isManagement, isLeadership, isAdminLevel } from '../lib/roles';

let authSubscription: { unsubscribe: () => void } | null = null;
let isInitializing = false;

interface AuthState {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => void;
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

  initialize: () => {
    if (isInitializing) return;
    isInitializing = true;

    if (authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      switch (event) {
        case 'INITIAL_SESSION':
        case 'SIGNED_IN': {
          if (!session?.user) {
            set({ user: null, profile: null, initialized: true, loading: false });
            return;
          }

          const currentUser = get().user;
          if (event === 'SIGNED_IN' && currentUser?.id === session.user.id && get().profile) {
            set({ loading: false });
            return;
          }

          const profile = await fetchProfileWithRetry(session.user.id);
          set(state => ({
            user: { id: session.user.id, email: session.user.email ?? '' },
            profile: profile ?? (state.profile?.id === session.user.id ? state.profile : null),
            initialized: true,
            loading: false,
          }));
          break;
        }

        case 'TOKEN_REFRESHED':
          break;

        case 'SIGNED_OUT':
          set({ user: null, profile: null, loading: false });
          break;
      }
    });

    authSubscription = subscription;
    isInitializing = false;
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false });
      throw error;
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
    const profile = await fetchProfileWithRetry(user.id);
    if (profile) {
      set({ profile });
    }
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
