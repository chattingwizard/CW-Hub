import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Shell() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-surface-0">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main
        className={`transition-all duration-300 min-h-screen ${
          collapsed ? 'ml-16' : 'ml-60'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
