import { AuthProvider, useAuth } from './core/auth';
import { ErrorBoundary } from './core/ErrorBoundary';
import { Layout } from './core/Layout';
import { LoginPage } from './core/LoginPage';
import { RouteHost } from './core/RouteHost';
import { BRANDING } from './config/branding';
import { ToastProvider } from './shared/feedback';

function Shell() {
  const { me, loading } = useAuth();
  if (loading) return <div className="splash">{BRANDING.appName}…</div>;
  if (!me) return <LoginPage />;
  return (
    <Layout>
      <RouteHost />
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary title="La aplicación tuvo un error">
      <ToastProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
