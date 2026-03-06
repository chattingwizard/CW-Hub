import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import {
  Shield, UserPlus, Copy, Check, RefreshCw, Search,
  Users, ShieldCheck, UserX, UserCheck, Ticket, AlertTriangle,
} from 'lucide-react';
import ErrorState from '../components/ErrorState';
import type { Profile, UserRole } from '../types';

const DocPermissions = lazy(() => import('./DocPermissions'));

type SettingsTab = 'users' | 'doc-permissions';
type InviteFilter = 'all' | 'available' | 'used';
type StatusFilter = 'all' | 'active' | 'inactive';

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  team_leader: 'Team Leader',
  script_manager: 'Script Manager',
  va: 'VA',
  chatter: 'Chatter',
  recruit: 'Recruit',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-cw/15 text-cw border-cw/30',
  admin: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  team_leader: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  script_manager: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  va: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  chatter: 'bg-success/15 text-success border-success/30',
  recruit: 'bg-warning/15 text-warning border-warning/30',
};

const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [UserRole, string][];

const canManageUsers = (role?: UserRole) => role === 'owner' || role === 'admin';

export default function Settings() {
  const { profile } = useAuthStore();

  const [tab, setTab] = useState<SettingsTab>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [inviteCodes, setInviteCodes] = useState<{ code: string; used_by: string | null; created_at: string; role?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [generating, setGenerating] = useState(false);
  const [inviteRole, setInviteRole] = useState<string>('recruit');

  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [inviteFilter, setInviteFilter] = useState<InviteFilter>('all');

  const [confirmModal, setConfirmModal] = useState<{
    userId: string;
    userName: string;
    isActive: boolean;
  } | null>(null);
  const [toggling, setToggling] = useState(false);

  // ── Data fetching ──────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, invitesRes] = await Promise.all([
        supabase.rpc('hub_get_users'),
        supabase.from('invite_codes').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      if (usersRes.error) throw new Error(usersRes.error.message);
      if (invitesRes.error) throw new Error(invitesRes.error.message);
      setUsers(usersRes.data ?? []);
      setInviteCodes(invitesRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ───────────────────────────────────────────

  const teams = useMemo(() => {
    const set = new Set<string>();
    (users as any[]).forEach((u) => { if (u.team_name) set.add(u.team_name); });
    return [...set].sort();
  }, [users]);

  const activeCount = useMemo(
    () => (users as any[]).filter((u) => u.is_active !== false).length,
    [users],
  );
  const inactiveCount = users.length - activeCount;
  const availableInvites = useMemo(
    () => inviteCodes.filter((c) => !c.used_by).length,
    [inviteCodes],
  );

  const filteredUsers = useMemo(() => {
    return (users as any[]).filter((u) => {
      if (userSearch) {
        const s = userSearch.toLowerCase();
        if (
          !u.full_name?.toLowerCase().includes(s) &&
          !u.email?.toLowerCase().includes(s)
        ) return false;
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && u.is_active === false) return false;
      if (statusFilter === 'inactive' && u.is_active !== false) return false;
      if (teamFilter !== 'all' && u.team_name !== teamFilter) return false;
      return true;
    });
  }, [users, userSearch, roleFilter, statusFilter, teamFilter]);

  const filteredInvites = useMemo(() => {
    if (inviteFilter === 'all') return inviteCodes;
    if (inviteFilter === 'available') return inviteCodes.filter((c) => !c.used_by);
    return inviteCodes.filter((c) => c.used_by);
  }, [inviteCodes, inviteFilter]);

  const hasActiveFilters = userSearch || roleFilter !== 'all' || statusFilter !== 'all' || teamFilter !== 'all';

  // ── Handlers ───────────────────────────────────────────────

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      const { error } = await supabase.rpc('hub_set_user_role', {
        target_id: userId,
        new_role: newRole,
      });
      if (error) throw error;
      setStatusMsg('Role updated');
      fetchData();
      setTimeout(() => setStatusMsg(''), 2000);
    } catch (err: unknown) {
      console.error('Role change failed:', err);
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Unknown error';
      setStatusMsg(`Error: ${msg}`);
    }
  };

  const handleToggleActive = async () => {
    if (!confirmModal) return;
    setToggling(true);
    try {
      const { error } = await supabase.rpc('hub_set_user_active', {
        target_id: confirmModal.userId,
        active: !confirmModal.isActive,
      });
      if (error) throw error;
      setStatusMsg(confirmModal.isActive ? 'Account deactivated' : 'Account activated');
      setConfirmModal(null);
      fetchData();
      setTimeout(() => setStatusMsg(''), 2500);
    } catch (err: unknown) {
      console.error('Toggle active failed:', err);
      setStatusMsg('Error: Could not update account status.');
    } finally {
      setToggling(false);
    }
  };

  const handleGenerateInvite = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_invite_code', { p_role: inviteRole });
      if (error) throw error;
      fetchData();
      if (data) {
        navigator.clipboard.writeText(data as string);
        setCopiedCode(data as string);
        setStatusMsg(`${ROLE_LABELS[inviteRole as UserRole] ?? inviteRole} invite code generated and copied!`);
        setTimeout(() => { setCopiedCode(null); setStatusMsg(''); }, 3000);
      }
    } catch (err: unknown) {
      console.error('Invite code generation failed:', err);
      setStatusMsg('Error: Could not generate invite code.');
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const clearFilters = () => {
    setUserSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
    setTeamFilter('all');
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cw/10 flex items-center justify-center">
            <Shield size={20} className="text-cw" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Settings</h1>
            <p className="text-sm text-text-secondary">Manage users, roles, and permissions</p>
          </div>
        </div>
        {statusMsg && (
          <span className={`text-sm px-3 py-1.5 rounded-lg transition-all ${
            statusMsg.startsWith('Error')
              ? 'bg-danger/10 text-danger border border-danger/20'
              : 'bg-success/10 text-success border border-success/20'
          }`}>
            {statusMsg}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-surface-2 rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'users' ? 'bg-surface-3 text-white shadow-sm' : 'text-text-muted hover:text-white'
          }`}
        >
          <Users size={15} /> Users & Invites
        </button>
        <button
          onClick={() => setTab('doc-permissions')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'doc-permissions' ? 'bg-surface-3 text-white shadow-sm' : 'text-text-muted hover:text-white'
          }`}
        >
          <ShieldCheck size={15} /> Doc Permissions
        </button>
      </div>

      {tab === 'doc-permissions' ? (
        <Suspense fallback={
          <div className="flex items-center justify-center py-12">
            <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
          </div>
        }>
          <DocPermissions />
        </Suspense>
      ) : (
      <>
        {/* ── Summary Cards ───────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: users.length, icon: Users, color: 'text-cw', bg: 'bg-cw/10' },
            { label: 'Active', value: activeCount, icon: UserCheck, color: 'text-success', bg: 'bg-success/10' },
            { label: 'Inactive', value: inactiveCount, icon: UserX, color: 'text-danger', bg: 'bg-danger/10' },
            { label: 'Available Invites', value: availableInvites, icon: Ticket, color: 'text-cw-light', bg: 'bg-cw-light/10' },
          ].map((card) => (
            <div key={card.label} className="bg-surface-1 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-white">{loading ? '—' : card.value}</p>
                  <p className="text-xs text-text-muted mt-0.5">{card.label}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon size={18} className={card.color} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Invite Codes ────────────────────────────────── */}
        <div className="bg-surface-1 border border-border rounded-xl p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">Invite Codes</h2>
              <p className="text-xs text-text-muted mt-0.5">Generate codes for new team members to register</p>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex gap-0.5 bg-surface-2 rounded-lg p-0.5">
                {(['all', 'available', 'used'] as InviteFilter[]).map((f) => {
                  const count =
                    f === 'all' ? inviteCodes.length
                    : f === 'available' ? availableInvites
                    : inviteCodes.length - availableInvites;
                  return (
                    <button
                      key={f}
                      onClick={() => setInviteFilter(f)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                        inviteFilter === f
                          ? 'bg-surface-3 text-white shadow-sm'
                          : 'text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'available' ? 'Available' : 'Used'} ({count})
                    </button>
                  );
                })}
              </div>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="bg-surface-2 border border-border text-white text-xs rounded-lg px-2.5 py-2 focus:border-cw focus:outline-none"
              >
                {ROLE_OPTIONS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <button
                onClick={handleGenerateInvite}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-cw hover:bg-cw-dark text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors shrink-0"
              >
                {generating ? <RefreshCw size={15} className="animate-spin" /> : <UserPlus size={15} />}
                Generate
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {filteredInvites.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">
                {inviteFilter === 'all' ? 'No invite codes generated yet.' : `No ${inviteFilter} codes.`}
              </p>
            ) : (
              filteredInvites.map((code) => (
                <div
                  key={code.code}
                  className="flex items-center justify-between bg-surface-2 rounded-lg px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-cw font-mono">{code.code}</code>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted font-medium">
                      {ROLE_LABELS[(code.role ?? 'recruit') as UserRole] ?? code.role ?? 'Recruit'}
                    </span>
                    {code.used_by ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-text-muted">Used</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">Available</span>
                    )}
                  </div>
                  <button
                    onClick={() => copyCode(code.code)}
                    className="p-1.5 rounded-lg hover:bg-surface-3 text-text-secondary hover:text-white transition-colors"
                    title="Copy code"
                  >
                    {copiedCode === code.code ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Users Section ───────────────────────────────── */}
        <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="px-5 py-4 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Team Members</h2>
              <span className="text-xs text-text-muted">
                {hasActiveFilters
                  ? `${filteredUsers.length} of ${users.length} users`
                  : `${users.length} users`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-cw transition-colors"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
                className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw focus:outline-none transition-colors"
              >
                <option value="all">All Roles</option>
                {ROLE_OPTIONS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw focus:outline-none transition-colors"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {teams.length > 0 && (
                <select
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:border-cw focus:outline-none transition-colors"
                >
                  <option value="all">All Teams</option>
                  {teams.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 text-xs text-text-muted hover:text-white transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Name', 'Email', 'Role', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-text-secondary font-medium text-xs uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-text-secondary">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
                        Loading...
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={5}>
                      <ErrorState message={error} onRetry={fetchData} />
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-text-muted">
                      {hasActiveFilters ? (
                        <div className="space-y-2">
                          <p>No users match your filters.</p>
                          <button onClick={clearFilters} className="text-cw hover:text-cw/80 text-xs">
                            Clear all filters
                          </button>
                        </div>
                      ) : 'No users found.'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user: any) => {
                    const isInactive = user.is_active === false;
                    const isSelf = user.id === profile?.id;

                    return (
                      <tr
                        key={user.id}
                        className={`border-b border-border/50 hover:bg-surface-2/50 transition-colors ${
                          isInactive ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                              isInactive ? 'bg-surface-3 text-text-muted' : 'bg-cw/15 text-cw'
                            }`}>
                              {(user.full_name || user.email).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="text-white font-medium">{user.full_name || '—'}</span>
                              {user.team_name && (
                                <p className="text-[10px] text-text-muted">{user.team_name}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-text-secondary text-xs">{user.email}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs border ${
                            ROLE_COLORS[user.role] ?? 'bg-surface-3 text-text-secondary border-border'
                          }`}>
                            {ROLE_LABELS[user.role as UserRole] ?? user.role}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`flex items-center gap-1.5 text-xs ${
                            !isInactive ? 'text-success' : 'text-danger'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${!isInactive ? 'bg-success' : 'bg-danger'}`} />
                            {!isInactive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {isSelf ? (
                            <span className="text-xs text-text-muted">You</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <select
                                value={user.role}
                                onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                                className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cw focus:outline-none transition-colors"
                              >
                                {ROLE_OPTIONS.map(([val, label]) => (
                                  <option key={val} value={val}>{label}</option>
                                ))}
                              </select>
                              {canManageUsers(profile?.role) && (
                                <button
                                  onClick={() => setConfirmModal({
                                    userId: user.id,
                                    userName: user.full_name || user.email,
                                    isActive: !isInactive,
                                  })}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    isInactive
                                      ? 'bg-success/10 text-success hover:bg-success/20 border border-success/20'
                                      : 'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20'
                                  }`}
                                >
                                  {isInactive ? 'Activate' : 'Deactivate'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
      )}

      {/* ── Confirmation Modal ────────────────────────────── */}
      {confirmModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => !toggling && setConfirmModal(null)}
        >
          <div
            className="bg-surface-1 border border-border rounded-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                confirmModal.isActive ? 'bg-danger/10' : 'bg-success/10'
              }`}>
                <AlertTriangle size={24} className={confirmModal.isActive ? 'text-danger' : 'text-success'} />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-white text-center mb-2">
              {confirmModal.isActive ? 'Deactivate Account' : 'Activate Account'}
            </h3>
            <p className="text-sm text-text-secondary text-center mb-1">
              {confirmModal.isActive
                ? <>Are you sure you want to deactivate <strong className="text-white">{confirmModal.userName}</strong>? They will immediately lose access to the Hub.</>
                : <>Are you sure you want to reactivate <strong className="text-white">{confirmModal.userName}</strong>? They will regain access to the Hub.</>}
            </p>
            <p className="text-xs text-text-muted text-center mb-6">
              {confirmModal.isActive
                ? 'You can reactivate this account at any time.'
                : 'They will be able to sign in again immediately.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={toggling}
                className="flex-1 px-4 py-2.5 bg-surface-2 hover:bg-surface-3 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleActive}
                disabled={toggling}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                  confirmModal.isActive
                    ? 'bg-danger hover:bg-danger/80'
                    : 'bg-success hover:bg-success/80'
                }`}
              >
                {toggling ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </span>
                ) : confirmModal.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
