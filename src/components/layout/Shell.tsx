import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-0">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-surface-1 border-b border-border flex items-center px-4 z-30">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-surface-2 text-text-secondary hover:text-white"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <div className="w-7 h-7 rounded-lg bg-cw/20 flex items-center justify-center">
            <span className="text-cw font-bold text-xs">CW</span>
          </div>
          <span className="font-semibold text-white text-sm">CW Hub</span>
        </div>
      </div>

      <main
        className={`transition-all duration-300 min-h-screen pt-14 lg:pt-0 ${
          collapsed ? 'lg:ml-16' : 'lg:ml-60'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
