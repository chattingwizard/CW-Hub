import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { Shield, UserPlus, Copy, Check } from 'lucide-react';
import type { Profile, UserRole } from '../types';

export default function Settings() {
  const { profile } = useAuthStore();
  const [users, setUsers] = useState<Profile[]>([]);
  const [inviteCodes, setInviteCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

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
    try {
      const { data, error } = await supabase.rpc('generate_invite_code');
      if (error) throw error;
      fetchData();
      // Auto-copy
      if (data) {
        navigator.clipboard.writeText(data);
        setCopiedCode(data);
        setTimeout(() => setCopiedCode(null), 3000);
      }
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
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
      chatter: 'bg-success/15 text-success border-success/30',
      recruit: 'bg-warning/15 text-warning border-warning/30',
    };
    return colors[role] ?? 'bg-surface-3 text-text-secondary';
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-cw" />
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>
        {statusMsg && (
          <span className={`text-sm ${statusMsg.startsWith('Error') ? 'text-danger' : 'text-success'}`}>
            {statusMsg}
          </span>
        )}
      </div>

      {/* Invite Codes Section */}
      <div className="bg-surface-1 border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Invite Codes</h2>
          <button
            onClick={handleGenerateInvite}
            className="flex items-center gap-2 px-4 py-2 bg-cw hover:bg-cw-dark text-white rounded-lg text-sm font-medium"
          >
            <UserPlus size={16} />
            Generate New Code
          </button>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {inviteCodes.map((code) => (
            <div
              key={code.code}
              className="flex items-center justify-between bg-surface-2 rounded-lg px-4 py-2.5"
            >
              <code className="text-sm text-cw font-mono">{code.code}</code>
              <div className="flex items-center gap-3">
                {code.used_by ? (
                  <span className="text-xs text-text-muted">Used</span>
                ) : (
                  <span className="text-xs text-success">Available</span>
                )}
                <button
                  onClick={() => copyCode(code.code)}
                  className="p-1 rounded hover:bg-surface-3 text-text-secondary hover:text-white"
                >
                  {copiedCode === code.code ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-white">Team Members</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Name', 'Email', 'Role', 'Team', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-text-secondary font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-text-secondary">Loading...</td>
                </tr>
              ) : (
                users.map((user: any) => (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-surface-2/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cw/15 flex items-center justify-center text-cw text-xs font-medium">
                          {(user.full_name || user.email).charAt(0).toUpperCase()}
                        </div>
                        <span className="text-white">{user.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-text-secondary">{user.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs border ${roleBadge(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-text-secondary">{user.team_name || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs ${user.is_active ? 'text-success' : 'text-danger'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {user.id !== profile?.id && (
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                          className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs text-white"
                        >
                          <option value="recruit">Recruit</option>
                          <option value="chatter">Chatter</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Owner</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
