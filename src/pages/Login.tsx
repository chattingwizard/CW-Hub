import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { getDefaultPath } from '../lib/modules';
import { Eye, EyeOff } from 'lucide-react';
import type { Profile } from '../types';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const { signIn, signUp, resetPassword, loading, user, profile } = useAuthStore();
  const navigate = useNavigate();

  const loginTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (loading) {
      loginTimer.current = setTimeout(() => {
        useAuthStore.setState({ loading: false });
        setError('Sign in is taking too long. Please try again.');
      }, 15_000);
    }
    return () => { if (loginTimer.current) clearTimeout(loginTimer.current); };
  }, [loading]);

  if (user && profile) {
    return <Navigate to={getDefaultPath(profile.role)} replace />;
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || 'Could not send reset email.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          return;
        }
        await signUp(email, password, fullName, inviteCode);
      }

      // Check immediately — signIn should have set user + profile
      const store = useAuthStore.getState();
      if (store.user && store.profile) {
        navigate(getDefaultPath(store.profile.role));
        return;
      }

      // Fallback: subscribe to the store and wait for profile (up to 3s)
      const profile = await new Promise<Profile | null>(resolve => {
        const timeout = setTimeout(() => resolve(null), 3000);
        const unsub = useAuthStore.subscribe(state => {
          if (state.profile) {
            clearTimeout(timeout);
            unsub();
            resolve(state.profile);
          }
        });
        // Also check current state in case it updated between getState and subscribe
        const current = useAuthStore.getState();
        if (current.profile) {
          clearTimeout(timeout);
          unsub();
          resolve(current.profile);
        }
      });

      if (profile) {
        navigate(getDefaultPath(profile.role));
        return;
      }

      // Last resort: try explicit profile refresh
      await useAuthStore.getState().refreshProfile();
      const final = useAuthStore.getState();
      if (final.profile) {
        navigate(getDefaultPath(final.profile.role));
      } else {
        setError('Signed in successfully but could not load your profile. Please refresh the page.');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    }
  };

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cw/20 mb-4">
            <span className="text-cw font-bold text-2xl">CW</span>
          </div>
          <h1 className="text-2xl font-bold text-white">CW Hub</h1>
          <p className="text-text-secondary text-sm mt-1">Chatting Wizard Operations Center</p>
        </div>

        {/* Card */}
        <div className="bg-surface-1 border border-border rounded-2xl p-8">
          {mode === 'forgot' ? (
            // Forgot password view
            <>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setResetSent(false); }}
                className="text-text-muted hover:text-text-secondary text-sm mb-4 inline-flex items-center gap-1 transition-colors"
              >
                &larr; Back to Sign In
              </button>
              <h2 className="text-lg font-semibold text-white mb-1">Reset your password</h2>
              <p className="text-text-secondary text-sm mb-6">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
              {resetSent ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-emerald-400 text-sm">
                  Check your email for a password reset link. You can close this tab.
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
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
                  {error && (
                    <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-2.5 text-danger text-sm">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-cw hover:bg-cw-dark text-white font-medium rounded-lg px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending...
                      </span>
                    ) : 'Send Reset Link'}
                  </button>
                </form>
              )}
            </>
          ) : (
          <>
          {/* Tab switcher */}
          <div className="flex bg-surface-2 rounded-lg p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'login' ? 'bg-surface-3 text-white' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'register' ? 'bg-surface-3 text-white' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={100}
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
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-white placeholder-text-muted focus:outline-none focus:border-cw focus:ring-1 focus:ring-cw font-mono"
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
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 pr-10 text-white placeholder-text-muted focus:outline-none focus:border-cw focus:ring-1 focus:ring-cw"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <div className="text-right -mt-1">
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); }}
                  className="text-cw hover:text-cw/80 text-sm transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-2.5 text-danger text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cw hover:bg-cw-dark text-white font-medium rounded-lg px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          </>
          )}
        </div>

        <p className="text-center text-text-muted text-xs mt-6">
          Chatting Wizard &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
