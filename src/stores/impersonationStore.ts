import { create } from 'zustand';
import type { UserRole } from '../types';
import { supabase } from '../lib/supabase';

interface ImpersonationState {
  active: boolean;
  role: UserRole | null;
  userId: string | null;
  userName: string | null;

  activateRole: (role: UserRole) => void;
  activateUser: (userId: string, userName: string, role: UserRole) => void;
  deactivate: () => void;
  getEffectiveRole: (realRole: UserRole) => UserRole;
}

function logImpersonation(realUserId: string, role: UserRole | null, targetUserId: string | null) {
  supabase.from('impersonation_log').insert({
    user_id: realUserId,
    impersonated_role: role,
    impersonated_user_id: targetUserId,
  }).then(({ error }) => {
    if (error) console.warn('Impersonation log failed:', error.message);
  });
}

export const useImpersonationStore = create<ImpersonationState>((set, get) => ({
  active: false,
  role: null,
  userId: null,
  userName: null,

  activateRole: (role: UserRole) => {
    set({ active: true, role, userId: null, userName: null });
  },

  activateUser: (userId: string, userName: string, role: UserRole) => {
    set({ active: true, role, userId, userName });
  },

  deactivate: () => {
    set({ active: false, role: null, userId: null, userName: null });
  },

  getEffectiveRole: (realRole: UserRole) => {
    const { active, role } = get();
    if (active && role) return role;
    return realRole;
  },
}));

export function logImpersonationStart(realUserId: string, role: UserRole | null, targetUserId: string | null) {
  logImpersonation(realUserId, role, targetUserId);
}
