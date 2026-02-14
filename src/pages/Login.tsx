import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { getDefaultPath } from '../lib/modules';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  const { signIn, signUp, loading, profile } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName, inviteCode);
      }
      // Wait a tick for profile to load
      setTimeout(() => {
        const store = useAuthStore.getState();
        const path = getDefaultPath(store.profile?.role ?? 'recruit');
        navigate(path);
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    }
  };

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-cw/20 mb-4">
            <span className="text-cw font-bold text-xl">CW</span>
          </div>
          <h1 className="text-2xl font-bold text-white">CW Hub</h1>
          <p className="text-text-secondary text-sm mt-1">Chatting Wizard</p>
        </div>

        {/* Card */}
        <div className="bg-surface-1 border border-border rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-white placeholder-text-muted focus:outline-none focus:border-cw focus:ring-1 focus:ring-cw"
                    placeholder="Your full name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">Invite Code</label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-white placeholder-text-muted focus:outline-none focus:border-cw focus:ring-1 focus:ring-cw"
                    placeholder="CW-XXXXXXXX"
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-white placeholder-text-muted focus:outline-none focus:border-cw focus:ring-1 focus:ring-cw"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-white placeholder-text-muted focus:outline-none focus:border-cw focus:ring-1 focus:ring-cw"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-2.5 text-danger text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cw hover:bg-cw-dark text-white font-medium rounded-lg px-4 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading...
                </span>
              ) : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            {mode === 'login' ? (
              <button
                onClick={() => { setMode('register'); setError(''); }}
                className="text-sm text-cw hover:text-cw-light"
              >
                Don't have an account? <span className="underline">Use your invite code</span>
              </button>
            ) : (
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className="text-sm text-cw hover:text-cw-light"
              >
                Already have an account? <span className="underline">Sign in</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
