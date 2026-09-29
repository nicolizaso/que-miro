import { Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { Film } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { useApplyTheme } from '@/lib/theme';
import { ExploreView } from '@/views/ExploreView';
import { CalendarView } from '@/views/CalendarView';
import { ListView } from '@/views/ListView';
import { LoginView } from '@/views/LoginView';
import { NotFoundView } from '@/views/NotFoundView';
import {
  ProfileSettings,
  ProfileSummary,
  ProfileView,
} from '@/views/ProfileView';
import { PublicProfileView } from '@/views/PublicProfileView';
import { TasteProfileView } from '@/views/TasteProfileView';
import { FollowingView } from '@/views/FollowingView';
import { SmartPickerView } from '@/views/SmartPickerView';

/** Pantalla de carga mientras Firebase resuelve si hay sesión. */
function Splash() {
  return (
    <div
      className="min-h-[100dvh] bg-bg-main flex items-center justify-center"
      role="status"
      aria-label="Cargando"
    >
      <div className="w-12 h-12 rounded-control bg-accent animate-pulse flex items-center justify-center">
        <Film size={24} className="text-accent-contrast" aria-hidden="true" />
      </div>
    </div>
  );
}

function AppRoutes() {
  const { authState } = useAuth();
  useApplyTheme();

  if (authState === 'loading') return <Splash />;

  if (authState === 'unauthenticated') {
    return (
      <Routes>
        <Route path="/login" element={<LoginView />} />
        {/* El perfil público se ve sin sesión: es todo el punto de compartirlo. */}
        <Route path="/u/:slug" element={<PublicProfileView />} />
        {/* Cualquier otra ruta manda al login. `replace` para no dejar la ruta
            protegida en el historial y que "atrás" rebote de vuelta acá. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/u/:slug" element={<PublicProfileView />} />
      <Route element={<AppLayout />}>
        <Route index element={<ListView />} />
        <Route path="explorar" element={<ExploreView />} />
        <Route path="picker" element={<SmartPickerView />} />
        <Route path="calendario" element={<CalendarView />} />
        <Route path="perfil" element={<ProfileView />}>
          <Route index element={<ProfileSummary />} />
          <Route path="gustos" element={<TasteProfileView />} />
          <Route path="siguiendo" element={<FollowingView />} />
          <Route path="ajustes" element={<ProfileSettings />} />
        </Route>
        <Route path="*" element={<NotFoundView />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    // `reducedMotion="user"` desactiva las animaciones de Motion para quien lo
    // pidió en su sistema. El CSS equivalente está en index.css.
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
