import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router';
import { RootLayout } from './components/layouts/RootLayout';
import { AuthLayout } from './components/layouts/AuthLayout';
import { DashboardLayout } from './components/layouts/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { DocumentPage } from './pages/DocumentPage';
import { TMListPage } from './pages/TMListPage';
import { TBListPage } from './pages/TBListPage';
import { SettingsPage } from './pages/SettingsPage';
import { SearchPage } from './pages/SearchPage';
import { useAuthStore } from './stores/auth';

// Root route
const rootRoute = createRootRoute({
  component: RootLayout,
});

// Auth routes (public)
const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: AuthLayout,
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      throw redirect({ to: '/dashboard' });
    }
  },
});

const loginRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/login',
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/register',
  component: RegisterPage,
});

const verifyEmailRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/verify-email',
  component: VerifyEmailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || '',
  }),
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || '',
  }),
});

// Protected routes
const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  component: DashboardLayout,
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/dashboard',
  component: DashboardPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/projects',
  component: ProjectsPage,
});

const projectDetailRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/projects/$projectId',
  component: ProjectDetailPage,
});

const documentRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/documents/$documentId',
  component: DocumentPage,
});

const tmRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/tm',
  component: TMListPage,
});

const tbRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/tb',
  component: TBListPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/settings',
  component: SettingsPage,
});

const searchRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/search',
  component: SearchPage,
  validateSearch: (search: Record<string, unknown>) => ({
    q: (search.q as string) || '',
  }),
});

// Index redirect
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const { isAuthenticated } = useAuthStore.getState();
    throw redirect({ to: isAuthenticated ? '/dashboard' : '/login' });
  },
});

// Build route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute.addChildren([
    loginRoute,
    registerRoute,
    verifyEmailRoute,
    forgotPasswordRoute,
    resetPasswordRoute,
  ]),
  protectedRoute.addChildren([
    dashboardRoute,
    projectsRoute,
    projectDetailRoute,
    documentRoute,
    tmRoute,
    tbRoute,
    settingsRoute,
    searchRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
