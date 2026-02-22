import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { getDefaultPath } from '../../lib/roles';
import type { UserRole } from '../../types';

interface Props {
  children: React.ReactNode;
  roles?: UserRole[];
}

export default function ProtectedRoute({ children, roles }: Props) {
  const { user, profile, initialized } = useAuthStore();

  if (!initialized) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cw/20 flex items-center justify-center animate-pulse">
            <span className="text-cw font-bold">CW</span>
          </div>
          <p className="text-text-secondary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={getDefaultPath(profile.role)} replace />;
  }

  return <>{children}</>;
}
