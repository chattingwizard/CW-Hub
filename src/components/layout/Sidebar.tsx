import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { getModulesForRole } from '../../lib/modules';
import { ROLE_LABELS } from '../../lib/roles';
import type { HubModule } from '../../types';
import {
  BarChart3, Calendar, Users, LayoutDashboard,
  GraduationCap, FileText, Settings, Activity,
  ClipboardCheck, Shield, Upload, BookOpen, Radio,
  CheckSquare, BookMarked,
  LogOut, ChevronLeft, Menu, ExternalLink,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  BarChart3, Calendar, Users, LayoutDashboard,
  GraduationCap, FileText, Settings, Activity,
  ClipboardCheck, Shield, Upload, BookOpen, Radio,
  CheckSquare, BookMarked,
};

const SECTION_LABELS: Record<string, string> = {
  main: 'Operations',
  coaching: 'Coaching',
  tools: 'Tools',
  system: 'System',
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
  const expanded = !collapsed || mobileOpen;

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
    onMobileClose();
  };

  // Group modules by section
  const sections: { key: string; modules: HubModule[] }[] = [];
  let currentSection = '';
  for (const mod of visibleModules) {
    if (mod.section !== currentSection) {
      currentSection = mod.section;
      sections.push({ key: currentSection, modules: [] });
    }
    sections[sections.length - 1]!.modules.push(mod);
  }

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-border shrink-0">
        {expanded && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cw/30 to-cw/10 flex items-center justify-center">
              <span className="text-cw font-extrabold text-sm">CW</span>
            </div>
            <div>
              <span className="font-extrabold text-text-primary text-sm tracking-tight">CW Hub</span>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary hidden lg:block"
        >
          {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
        </button>
        <button
          onClick={onMobileClose}
          className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary lg:hidden"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {sections.map((section, sIdx) => (
          <div key={section.key} className={sIdx > 0 ? 'mt-4' : ''}>
            {/* Section label */}
            {expanded && (
              <div className="px-3 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted/60">
                  {SECTION_LABELS[section.key] || section.key}
                </span>
              </div>
            )}
            {!expanded && sIdx > 0 && (
              <div className="mx-2 mb-2 border-t border-border" />
            )}

            <div className="space-y-0.5">
              {section.modules.map((mod) => {
                const Icon = iconMap[mod.icon] ?? BarChart3;
                const path = getModulePath(mod);

                return (
                  <NavLink
                    key={mod.id}
                    to={mod.disabled ? '#' : path}
                    onClick={(e) => handleNavClick(mod, e)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                        mod.disabled
                          ? 'opacity-30 cursor-not-allowed'
                          : isActive
                          ? 'bg-cw/12 text-cw shadow-sm shadow-cw/5'
                          : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                      }`
                    }
                  >
                    <Icon size={17} className="shrink-0" />
                    {expanded && (
                      <>
                        <span className="flex-1 truncate">{mod.name}</span>
                        {mod.badge && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-3 text-text-muted font-bold">
                            {mod.badge}
                          </span>
                        )}
                        {mod.type === 'iframe' && !mod.disabled && (
                          <ExternalLink size={11} className="text-text-muted/50" />
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-border p-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-cw/15 flex items-center justify-center shrink-0 ring-1 ring-cw/20">
            <span className="text-cw text-xs font-bold">
              {profile.full_name?.charAt(0)?.toUpperCase() || profile.email.charAt(0).toUpperCase()}
            </span>
          </div>
          {expanded && (
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary font-semibold truncate">
                {profile.full_name || profile.email}
              </p>
              <p className="text-[11px] text-text-muted">
                {ROLE_LABELS[profile.role] || profile.role}
              </p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-danger shrink-0"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={`fixed top-0 left-0 h-full bg-surface-1 border-r border-border flex-col z-40 transition-all duration-200 hidden lg:flex ${
          collapsed ? 'w-14' : 'w-56'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-surface-1 border-r border-border flex flex-col z-50 transition-transform duration-200 lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
