import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types';

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

  // Helpers
  hasRole: (...roles: UserRole[]) => boolean;
  isAdminOrOwner: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: false,
  initialized: false,

  initialize: async () => {
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
    } catch {
      set({ user: null, profile: null, initialized: true });
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        set({ user: null, profile: null });
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        set({
          user: { id: session.user.id, email: session.user.email ?? '' },
          profile: profile as Profile | null,
        });
      }
    });
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    if (error) throw error;
  },

  signUp: async (email: string, password: string, fullName: string, inviteCode: string) => {
    set({ loading: true });
    try {
      // Validate invite code
      const { data: valid, error: checkErr } = await supabase.rpc('validate_invite_code', {
        invite_code: inviteCode,
      });
      if (checkErr) throw checkErr;
      if (!valid) throw new Error('Invalid or already used invite code.');

      // Create account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;

      // Mark invite code as used
      if (data.user) {
        await supabase.rpc('use_invite_code', {
          invite_code: inviteCode,
          for_user_id: data.user.id,
        });
      }
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    set({ profile: profile as Profile | null });
  },

  hasRole: (...roles: UserRole[]) => {
    const { profile } = get();
    return profile ? roles.includes(profile.role) : false;
  },

  isAdminOrOwner: () => {
    const { profile } = get();
    return profile ? ['admin', 'owner'].includes(profile.role) : false;
  },
}));
