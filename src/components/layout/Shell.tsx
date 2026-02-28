import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { ensureSession } from '../../lib/supabase';
import Sidebar from './Sidebar';
import NotificationBell from '../NotificationBell';

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    ensureSession();
  }, [location.pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') ensureSession();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

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
      <div className={`hidden lg:flex fixed top-0 right-0 h-13 bg-surface-0/80 backdrop-blur-md border-b border-border items-center gap-2 px-5 z-20 transition-all ${collapsed ? 'left-14' : 'left-56'}`}>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          {profile && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-2/50 cursor-default">
              <div className="w-7 h-7 rounded-full bg-cw/15 flex items-center justify-center ring-1 ring-cw/20">
                <span className="text-cw text-[10px] font-bold">
                  {profile.full_name?.charAt(0)?.toUpperCase() || '?'}
                </span>
              </div>
              <span className="text-xs text-text-secondary font-medium">{profile.full_name}</span>
            </div>
          )}
        </div>
      </div>

      <main
        className={`transition-all duration-200 min-h-screen pt-13 ${
          collapsed ? 'lg:ml-14' : 'lg:ml-56'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
