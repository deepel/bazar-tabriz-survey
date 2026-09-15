import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LoadingState from './components/LoadingState';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AdminDashboard from './pages/AdminDashboard';
import AdminLayers from './pages/AdminLayers';
import AdminShops from './pages/AdminShops';
import ImportGeoJSON from './pages/ImportGeoJSON';
import Login from './pages/Login';
import Messages from './pages/Messages';
import SurveyMap from './pages/SurveyMap';

function AuthGuard({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen">
        <LoadingState message="در حال دریافت اطلاعات..." />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/survey" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState message="در حال دریافت اطلاعات..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/survey'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/survey"
            element={
              <AuthGuard>
                <SurveyMap />
              </AuthGuard>
            }
          />
          <Route
            path="/messages"
            element={
              <AuthGuard>
                <Messages />
              </AuthGuard>
            }
          />
          <Route
            path="/admin"
            element={
              <AuthGuard admin>
                <AdminDashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/import"
            element={
              <AuthGuard admin>
                <ImportGeoJSON />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/shops"
            element={
              <AuthGuard admin>
                <AdminShops />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/layers"
            element={
              <AuthGuard admin>
                <AdminLayers />
              </AuthGuard>
            }
          />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}