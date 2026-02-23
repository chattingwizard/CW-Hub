import { useEffect, lazy, Suspense, Component, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { getDefaultPath } from './lib/roles';

import Shell from './components/layout/Shell';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Login from './pages/Login';

function lazyRetry(factory: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    factory().catch(() => {
      window.location.reload();
      return factory();
    }),
  );
}

const Overview = lazyRetry(() => import('./pages/Overview'));
const Dashboard = lazyRetry(() => import('./pages/Dashboard'));
const Schedules = lazyRetry(() => import('./pages/Schedules'));
const Assignments = lazyRetry(() => import('./pages/Assignments'));
const ChatterPerformance = lazyRetry(() => import('./pages/ChatterPerformance'));
const CoachingQueue = lazyRetry(() => import('./pages/CoachingQueue'));
const CoachingOverview = lazyRetry(() => import('./pages/CoachingOverview'));
const ChatterDashboard = lazyRetry(() => import('./pages/ChatterDashboard'));
const Settings = lazyRetry(() => import('./pages/Settings'));
const EmbeddedModule = lazyRetry(() => import('./pages/EmbeddedModule'));
const UploadCenter = lazyRetry(() => import('./pages/UploadCenter'));
const ModelInfo = lazyRetry(() => import('./pages/ModelInfo'));
const Tasks = lazyRetry(() => import('./pages/Tasks'));
const KnowledgeBase = lazyRetry(() => import('./pages/KnowledgeBase'));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
          <p className="text-text-secondary text-sm">Something went wrong loading this page.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-cw text-white text-sm font-medium hover:bg-cw/90">
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
            <span className="text-cw font-extrabold text-lg">CW</span>
          </div>
          <p className="text-text-secondary text-sm font-medium">Loading CW Hub...</p>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <ProtectedRoute>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route
              path="/overview"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager']}>
                  <Overview />
                </ProtectedRoute>
              }
            />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager', 'team_leader']}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/schedules"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager', 'team_leader']}>
                  <Schedules />
                </ProtectedRoute>
              }
            />

            <Route
              path="/assignments"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager', 'team_leader']}>
                  <Assignments />
                </ProtectedRoute>
              }
            />

            <Route
              path="/tasks"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager', 'va', 'personal_assistant']}>
                  <Tasks />
                </ProtectedRoute>
              }
            />

            <Route
              path="/chatter-performance"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager', 'team_leader']}>
                  <ChatterPerformance />
                </ProtectedRoute>
              }
            />

            <Route
              path="/coaching-queue"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager', 'team_leader']}>
                  <CoachingQueue />
                </ProtectedRoute>
              }
            />

            <Route
              path="/coaching-overview"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager']}>
                  <CoachingOverview />
                </ProtectedRoute>
              }
            />

            <Route
              path="/upload-center"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager', 'script_manager', 'va', 'personal_assistant']}>
                  <UploadCenter />
                </ProtectedRoute>
              }
            />

            <Route
              path="/model-info"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager', 'chatter']}>
                  <ModelInfo />
                </ProtectedRoute>
              }
            />

            <Route
              path="/knowledge-base"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager', 'va', 'personal_assistant', 'chatter', 'recruit']}>
                  <KnowledgeBase />
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-dashboard"
              element={
                <ProtectedRoute roles={['chatter', 'va']}>
                  <ChatterDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <ProtectedRoute roles={['owner']}>
                  <Settings />
                </ProtectedRoute>
              }
            />

            <Route
              path="/embed/:moduleId"
              element={
                <ProtectedRoute roles={['owner', 'admin', 'chatter_manager', 'team_leader', 'script_manager', 'chatter', 'recruit']}>
                  <EmbeddedModule />
                </ProtectedRoute>
              }
            />
          </Route>

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
      </Suspense>
      </ErrorBoundary>
    </HashRouter>
  );
}
