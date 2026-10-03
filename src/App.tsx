import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { Film } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { isFirebaseConfigured } from '@/lib/firebase';
import { landsOnExplore } from '@/lib/landing';
import { readPendingSave } from '@/lib/pendingSave';
import { SignInPrompt } from '@/components/SignInPrompt';
import { usePendingSaveReplay } from '@/hooks/usePendingSaveReplay';
import { useApplyTheme } from '@/lib/theme';
import { useMediaStore } from '@/store';
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
import { PublicListView } from '@/views/PublicListView';
import { TasteProfileView } from '@/views/TasteProfileView';
import { SocialFeedTab, SocialInboxTab, SocialSearchTab, SocialView } from '@/views/SocialView';
import { UserProfileView } from '@/views/UserProfileView';
import { TogetherView } from '@/views/TogetherView';
import { PersonView } from '@/views/PersonView';
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

/**
 * El inicio: tus listas, salvo para quien abre la app sin nada guardado, que
 * cae en Explorar. Una biblioteca vacía no tiene nada que mostrar, y Explorar
 * es lo que hace que alguien que llegó por curiosidad se quede.
 */
function Home() {
  const { authState } = useAuth();
  const librarySize = useMediaStore((state) => state.mediaList.length);
  const location = useLocation();

  // La primera ubicación del router es la única con clave `default`: es
  // "acabo de abrir la app", no "toqué Mis listas". Recargar conserva la
  // clave, así que quien recarga se queda donde estaba.
  const isInitialLoad = location.key === 'default';
  if (landsOnExplore({ isGuest: authState === 'guest', librarySize, isInitialLoad })) {
    // Con la query: un `?ficha=` de un aviso se abre igual sobre Explorar.
    return <Navigate to={{ pathname: '/explorar', search: location.search }} replace />;
  }
  return <ListView />;
}

function AppRoutes() {
  const { authState } = useAuth();
  useApplyTheme();
  usePendingSaveReplay();

  if (authState === 'loading') return <Splash />;

  return (
    <>
      <Routes>
        {/* El login es para quien quiere sincronizar, no una puerta de entrada:
            se llega desde la app. Solo desde invitado: con cuenta no hace
            falta. Sin Firebase no hay cuentas a las que entrar. Recién
            entrado, vuelve a donde estaba si llegó queriendo guardar algo
            (ver `lib/pendingSave.ts`). */}
        <Route
          path="/login"
          element={
            authState === 'guest' && isFirebaseConfigured ? (
              <LoginView />
            ) : (
              <Navigate to={readPendingSave()?.returnTo ?? '/'} replace />
            )
          }
        />
        {/* Sin cuenta no hay nada social que hacer en un perfil: el invitado ve
            la vidriera, como quien llega sin sesión. Con cuenta, el perfil es
            parte de la app. */}
        {authState === 'guest' && <Route path="/u/:slug" element={<PublicProfileView />} />}
        <Route path="/l/:id" element={<PublicListView />} />
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="explorar" element={<ExploreView />} />
          <Route path="picker" element={<SmartPickerView />} />
          <Route path="calendario" element={<CalendarView />} />
          <Route path="juntos/:slug" element={<TogetherView />} />
          {authState !== 'guest' && <Route path="u/:slug" element={<UserProfileView />} />}
          <Route path="social" element={<SocialView />}>
            <Route index element={<SocialFeedTab />} />
            <Route path="notificaciones" element={<SocialInboxTab />} />
            <Route path="buscar" element={<SocialSearchTab />} />
          </Route>
          <Route path="persona/:id" element={<PersonView />} />
          <Route path="perfil" element={<ProfileView />}>
            <Route index element={<ProfileSummary />} />
            <Route path="gustos" element={<TasteProfileView />} />
            {/* Siguiendo pasó a ser el feed social: los links viejos siguen andando. */}
            <Route path="siguiendo" element={<Navigate to="/social" replace />} />
            <Route path="ajustes" element={<ProfileSettings />} />
          </Route>
          <Route path="*" element={<NotFoundView />} />
        </Route>
      </Routes>
      {/* Fuera de las rutas: se guarda también desde una lista compartida, que
          no lleva el marco de la app. */}
      <SignInPrompt />
    </>
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
