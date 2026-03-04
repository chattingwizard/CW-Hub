import { useState, Suspense, useRef, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, LogOut, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { ROLE_LABELS } from '../../lib/roles';
import Sidebar from './Sidebar';
import NotificationBell from '../NotificationBell';

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex items-center gap-2 text-text-secondary">
        <div className="w-4 h-4 border-2 border-cw/30 border-t-cw rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading...</span>
      </div>
    </div>
  );
}

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { profile, signOut } = useAuthStore();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    await signOut();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-surface-0 text-text-primary">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-13 bg-surface-1/95 backdrop-blur-md border-b border-border flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cw/20 flex items-center justify-center">
              <span className="text-cw font-extrabold text-xs">CW</span>
            </div>
            <span className="font-bold text-text-primary text-sm">CW Hub</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          {profile && (
            <div className="w-7 h-7 rounded-full bg-cw/15 flex items-center justify-center ring-1 ring-cw/20">
              <span className="text-cw text-[10px] font-bold">
                {profile.full_name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Desktop header bar with notifications */}
      <div className={`hidden lg:flex fixed top-0 right-0 h-13 items-center gap-2 px-5 z-20 transition-all bg-surface-1/95 backdrop-blur-md border-b border-border ${collapsed ? 'left-14' : 'left-56'}`}>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          {profile && (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-cw/15 flex items-center justify-center ring-1 ring-cw/20">
                  <span className="text-cw text-[10px] font-bold">
                    {profile.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>
                <span className="text-xs text-text-secondary font-medium">{profile.full_name}</span>
                <ChevronDown size={12} className={`text-text-muted transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-semibold text-text-primary truncate">{profile.full_name}</p>
                    <p className="text-[11px] text-text-muted mt-0.5">{ROLE_LABELS[profile.role] || profile.role}</p>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger/10 transition-colors"
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <main
        className={`transition-all duration-200 min-h-screen pt-13 ${
          collapsed ? 'lg:ml-14' : 'lg:ml-56'
        }`}
      >
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
