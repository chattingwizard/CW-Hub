import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { Shield, UserPlus, Copy, Check, RefreshCw, Search, Users, ShieldCheck } from 'lucide-react';
import type { Profile, UserRole } from '../types';

const DocPermissions = lazy(() => import('./DocPermissions'));

type SettingsTab = 'users' | 'doc-permissions';

export default function Settings() {
  const { profile } = useAuthStore();
  const [tab, setTab] = useState<SettingsTab>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [inviteCodes, setInviteCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [generating, setGenerating] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [usersRes, invitesRes] = await Promise.all([
      supabase.rpc('hub_get_users'),
      supabase.from('invite_codes').select('*').order('created_at', { ascending: false }).limit(20),
    ]);
    setUsers(usersRes.data ?? []);
    setInviteCodes(invitesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    }
  };

  const handleGenerateInvite = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_invite_code');
      if (error) throw error;
      fetchData();
      if (data) {
        navigator.clipboard.writeText(data);
        setCopiedCode(data);
        setStatusMsg('Code generated and copied!');
        setTimeout(() => { setCopiedCode(null); setStatusMsg(''); }, 3000);
      }
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      owner: 'bg-cw/15 text-cw border-cw/30',
      admin: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      chatter_manager: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      team_leader: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      script_manager: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
      personal_assistant: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
      va: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      chatter: 'bg-success/15 text-success border-success/30',
      recruit: 'bg-warning/15 text-warning border-warning/30',
    };
    return colors[role] ?? 'bg-surface-3 text-text-secondary border-border';
  };

  const filteredUsers = (users as any[]).filter((u: any) => {
    if (!userSearch) return true;
    const search = userSearch.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(search) ||
      u.email?.toLowerCase().includes(search) ||
      u.role?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
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
          <span className={`text-sm px-3 py-1 rounded-lg ${
            statusMsg.startsWith('Error')
              ? 'bg-danger/10 text-danger'
              : 'bg-success/10 text-success'
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
        <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" /></div>}>
          <DocPermissions />
        </Suspense>
      ) : (
      <>
      {/* Invite Codes Section */}
      <div className="bg-surface-1 border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Invite Codes</h2>
            <p className="text-xs text-text-muted mt-0.5">Generate codes for new team members to register</p>
          </div>
          <button
            onClick={handleGenerateInvite}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-cw hover:bg-cw-dark text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {generating ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <UserPlus size={16} />
            )}
            Generate Code
          </button>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {inviteCodes.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No invite codes generated yet.</p>
          ) : (
            inviteCodes.map((code) => (
              <div
                key={code.code}
                className="flex items-center justify-between bg-surface-2 rounded-lg px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <code className="text-sm text-cw font-mono">{code.code}</code>
                  {code.used_by ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-text-muted">Used</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">Available</span>
                  )}
                </div>
                <button
                  onClick={() => copyCode(code.code)}
                  className="p-1.5 rounded-lg hover:bg-surface-3 text-text-secondary hover:text-white"
                  title="Copy code"
                >
                  {copiedCode === code.code ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white shrink-0">Team Members</h2>
          <div className="relative max-w-xs flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-cw"
            />
          </div>
        </div>
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
                  <td colSpan={5} className="px-5 py-8 text-center text-text-secondary">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-text-muted">
                    {userSearch ? 'No users match your search.' : 'No users found.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user: any) => (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-surface-2/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cw/15 flex items-center justify-center text-cw text-xs font-medium shrink-0">
                          {(user.full_name || user.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-white">{user.full_name || '—'}</span>
                          {user.team_name && (
                            <p className="text-[10px] text-text-muted">{user.team_name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-text-secondary text-xs">{user.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs border ${roleBadge(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`flex items-center gap-1.5 text-xs ${user.is_active !== false ? 'text-success' : 'text-danger'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.is_active !== false ? 'bg-success' : 'bg-danger'}`} />
                        {user.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {user.id !== profile?.id ? (
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                          className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cw focus:outline-none"
                        >
                          <option value="recruit">Recruit</option>
                          <option value="chatter">Chatter</option>
                          <option value="va">VA</option>
                          <option value="personal_assistant">Personal Assistant</option>
                          <option value="script_manager">Script Manager</option>
                          <option value="team_leader">Team Leader</option>
                          <option value="chatter_manager">Chatter Manager</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Owner</option>
                        </select>
                      ) : (
                        <span className="text-xs text-text-muted">You</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
