import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types';
import { isManagement, isLeadership, isAdminLevel } from '../lib/roles';

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
          await supabase.auth.admin?.deleteUser(data.user.id).catch(() => {});
          throw new Error('Invalid or already used invite code.');
        }
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
