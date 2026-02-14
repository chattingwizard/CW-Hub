import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { getModulesForRole } from '../../lib/modules';
import type { HubModule } from '../../types';
import {
  BarChart3, Calendar, Users, LayoutDashboard,
  TrendingUp, GraduationCap, FileText, Settings,
  LogOut, ChevronLeft, Menu, ExternalLink,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<any>> = {
  BarChart3, Calendar, Users, LayoutDashboard,
  TrendingUp, GraduationCap, FileText, Settings,
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();

  if (!profile) return null;

  const visibleModules = getModulesForRole(profile.role);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const getModulePath = (mod: HubModule) => {
    if (mod.type === 'iframe') return `/embed/${mod.id}`;
    return mod.path;
  };

  const handleNavClick = (mod: HubModule, e: React.MouseEvent) => {
    if (mod.disabled) {
      e.preventDefault();
      return;
    }
    // Close mobile menu on navigation
    onMobileClose();
  };

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cw/20 flex items-center justify-center">
              <span className="text-cw font-bold text-sm">CW</span>
            </div>
            <span className="font-semibold text-white text-sm">CW Hub</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-surface-2 text-text-secondary hover:text-white hidden lg:block"
        >
          {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
        </button>
        {/* Mobile close */}
        <button
          onClick={onMobileClose}
          className="p-1.5 rounded-lg hover:bg-surface-2 text-text-secondary hover:text-white lg:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visibleModules.map((mod) => {
          const Icon = iconMap[mod.icon] ?? BarChart3;
          const path = getModulePath(mod);

          return (
            <div key={mod.id}>
              {mod.dividerBefore && (
                <div className="my-3 mx-2 border-t border-border" />
              )}
              <NavLink
                to={mod.disabled ? '#' : path}
                onClick={(e) => handleNavClick(mod, e)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    mod.disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : isActive
                      ? 'bg-cw/15 text-cw font-medium'
                      : 'text-text-secondary hover:bg-surface-2 hover:text-white'
                  }`
                }
              >
                <Icon size={18} className="shrink-0" />
                {(!collapsed || mobileOpen) && (
                  <>
                    <span className="flex-1 truncate">{mod.name}</span>
                    {mod.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-text-muted font-medium">
                        {mod.badge}
                      </span>
                    )}
                    {mod.type === 'iframe' && !mod.disabled && (
                      <ExternalLink size={12} className="text-text-muted" />
                    )}
                  </>
                )}
              </NavLink>
            </div>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-border p-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-cw/20 flex items-center justify-center shrink-0">
            <span className="text-cw text-xs font-medium">
              {profile.full_name?.charAt(0)?.toUpperCase() || profile.email.charAt(0).toUpperCase()}
            </span>
          </div>
          {(!collapsed || mobileOpen) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{profile.full_name || profile.email}</p>
              <p className="text-[11px] text-text-muted capitalize">{profile.role}</p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-text-secondary hover:text-danger shrink-0"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full bg-surface-1 border-r border-border flex-col z-40 transition-all duration-300 hidden lg:flex ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-surface-1 border-r border-border flex flex-col z-50 transition-transform duration-300 lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
