import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { getDefaultPath } from './lib/modules';

import Shell from './components/layout/Shell';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Dashboard from './pages/Dashboard';
import Schedules from './pages/Schedules';
import Assignments from './pages/Assignments';
import ChatterPerformance from './pages/ChatterPerformance';
import CoachingQueue from './pages/CoachingQueue';
import CoachingOverview from './pages/CoachingOverview';
import ChatterDashboard from './pages/ChatterDashboard';
import Settings from './pages/Settings';
import EmbeddedModule from './pages/EmbeddedModule';

export default function App() {
  const { initialize, initialized, profile } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cw/20 flex items-center justify-center animate-pulse">
            <span className="text-cw font-bold text-lg">CW</span>
          </div>
          <p className="text-text-secondary text-sm">Loading CW Hub...</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected — Shell wraps all authenticated pages */}
        <Route
          element={
            <ProtectedRoute>
              <Shell />
            </ProtectedRoute>
          }
        >
          {/* Admin/Owner views */}
          <Route
            path="/overview"
            element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <Overview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedules"
            element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <Schedules />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assignments"
            element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <Assignments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chatter-performance"
            element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <ChatterPerformance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/coaching-queue"
            element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <CoachingQueue />
              </ProtectedRoute>
            }
          />
          <Route
            path="/coaching-overview"
            element={
              <ProtectedRoute roles={['owner', 'admin']}>
                <CoachingOverview />
              </ProtectedRoute>
            }
          />

          {/* Chatter view */}
          <Route
            path="/my-dashboard"
            element={
              <ProtectedRoute roles={['chatter']}>
                <ChatterDashboard />
              </ProtectedRoute>
            }
          />

          {/* Settings (owner only) */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute roles={['owner']}>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Embedded modules (iframes) */}
          <Route
            path="/embed/:moduleId"
            element={
              <ProtectedRoute roles={['owner', 'admin', 'chatter', 'recruit']}>
                <EmbeddedModule />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Default redirect */}
        <Route
          path="*"
          element={
            profile ? (
              <Navigate to={getDefaultPath(profile.role)} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </HashRouter>
  );
}
