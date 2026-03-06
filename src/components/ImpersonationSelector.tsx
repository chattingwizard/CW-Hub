import { useState, useRef, useEffect, useCallback } from 'react';
import { Eye, Search, User, Check } from 'lucide-react';
import { useImpersonationStore, logImpersonationStart } from '../stores/impersonationStore';
import { useAuthStore } from '../stores/authStore';
import { ROLE_LABELS, ALL_ROLES } from '../lib/roles';
import { supabase } from '../lib/supabase';
import type { UserRole } from '../types';

interface HubUser {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
}

export default function ImpersonationSelector() {
  const { profile } = useAuthStore();
  const { active, role: impRole, userName, activateRole, activateUser, deactivate } = useImpersonationStore();

  const [open, setOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [users, setUsers] = useState<HubUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) return null;

  const realRole = profile.role;
  const currentLabel = !active
    ? (ROLE_LABELS[realRole] ?? realRole)
    : userName
      ? `${userName}`
      : ROLE_LABELS[impRole!] ?? impRole;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRoleSelect = (role: UserRole) => {
    if (role === realRole) {
      deactivate();
    } else {
      activateRole(role);
      logImpersonationStart(profile.id, role, null);
    }
    setOpen(false);
  };

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('is_active', true)
      .order('full_name');
    setUsers((data as HubUser[] | null) ?? []);
    setLoadingUsers(false);
  }, []);

  const openUserModal = () => {
    setOpen(false);
    setUserModalOpen(true);
    setUserSearch('');
    loadUsers();
  };

  const handleUserSelect = (user: HubUser) => {
    activateUser(user.id, user.full_name || user.email, user.role);
    logImpersonationStart(profile.id, user.role, user.id);
    setUserModalOpen(false);
  };

  useEffect(() => {
    if (userModalOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [userModalOpen]);

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    return (u.full_name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  });

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            active
              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              : 'bg-surface-2 text-text-secondary hover:bg-surface-3'
          }`}
        >
          <Eye size={12} />
          <span>{currentLabel}</span>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-56 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden z-50">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">View as role</p>
            </div>
            <div className="p-1 max-h-64 overflow-y-auto">
              <button
                onClick={() => handleRoleSelect(realRole)}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs hover:bg-surface-2 transition-colors text-left"
              >
                <span className="flex-1 text-text-primary font-medium">{ROLE_LABELS[realRole] ?? realRole} (your view)</span>
                {!active && <Check size={13} className="text-cw" />}
              </button>

              <div className="mx-2 my-1 border-t border-border" />

              {ALL_ROLES.filter(r => r !== realRole).map(role => (
                <button
                  key={role}
                  onClick={() => handleRoleSelect(role)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs hover:bg-surface-2 transition-colors text-left"
                >
                  <span className="flex-1 text-text-primary">{ROLE_LABELS[role]}</span>
                  {active && impRole === role && !userName && <Check size={13} className="text-cw" />}
                </button>
              ))}

              <div className="mx-2 my-1 border-t border-border" />

              <button
                onClick={openUserModal}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs hover:bg-surface-2 transition-colors text-left"
              >
                <User size={13} className="text-text-muted" />
                <span className="text-text-secondary">Simulate specific user...</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User selection modal */}
      {userModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => setUserModalOpen(false)}>
          <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-bold text-text-primary">Simulate specific user</h3>
              <div className="mt-3 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  ref={searchRef}
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-cw/40 focus:outline-none"
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
              {loadingUsers ? (
                <div className="py-6 text-center text-text-muted text-xs">Loading users...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-6 text-center text-text-muted text-xs">No users found</div>
              ) : (
                filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => handleUserSelect(u)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-cw/15 flex items-center justify-center shrink-0">
                      <span className="text-cw text-[10px] font-bold">
                        {u.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{u.full_name || u.email}</p>
                      <p className="text-[10px] text-text-muted">{ROLE_LABELS[u.role] ?? u.role}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="p-3 border-t border-border">
              <button
                onClick={() => setUserModalOpen(false)}
                className="w-full py-2 rounded-lg bg-surface-2 text-xs font-medium text-text-secondary hover:bg-surface-3 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
