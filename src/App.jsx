import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/app-auth';
import UserNotRegisteredError from './components/UserNotRegisteredError';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Interventions from './pages/Interventions';
import NewIntervention from './pages/NewIntervention';
import InterventionDetail from './pages/InterventionDetail';
import Materials from './pages/Materials';
import Clients from './pages/Clients';
import AppSettings from './pages/AppSettings';
import AccountSettings from './pages/AccountSettings';
import TimeRecords from './pages/TimeRecords';
import GasBottles from './pages/GasBottles';
import StockMovements from './pages/StockMovements';
import Projects from './pages/Projects';
import EditIntervention from './pages/EditIntervention';
import NewVisit from './pages/NewVisit';
import WorkDayLog from './pages/WorkDayLog';
import WorkDayReport from './pages/WorkDayReport';
import Fichaje from './pages/Fichaje';
import Suppliers from './pages/Suppliers';
import StockBatchEntry from './pages/StockBatchEntry';
import MaterialRequests from './pages/MaterialRequests';
import AbsenceManagement from './pages/AbsenceManagement';
import Calendar from './pages/Calendar';
import OwnerClients from './pages/OwnerClients';
const normalizeRole = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const resolveUserRole = (user) =>
  normalizeRole(
    user?.role ||
      user?.current_membership?.role ||
      user?.membership?.role ||
      user?.current_organization_membership?.role ||
      ""
  );
const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<HiddenOwnerRouteGate user={user}><Layout /></HiddenOwnerRouteGate>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/interventions" element={<Interventions />} />
        <Route path="/interventions/new" element={<NewIntervention />} />
        <Route path="/interventions/:id" element={<InterventionDetail />} />
        <Route path="/interventions/:id/edit" element={<EditIntervention />} />
        <Route path="/interventions/:id/new-visit" element={<NewVisit />} />
        <Route path="/workday" element={<WorkDayLog />} />
        <Route path="/fichaje" element={<Fichaje />} />
        <Route path="/workday-report" element={<WorkDayReport />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/settings" element={<SettingsRoute user={user} />} />
        <Route path="/time-records" element={<TimeRecords />} />
        <Route path="/gas-bottles" element={<GasBottles />} />
        <Route path="/stock-movements" element={<StockMovements />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/stock-entry" element={<StockBatchEntry />} />
        <Route path="/material-requests" element={<MaterialRequests />} />
        <Route path="/absences" element={<AbsenceManagement />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/owner/clients" element={<OwnerClients />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
};

const SettingsRoute = ({ user }) => {
  const role = resolveUserRole(user);

  if (["tecnico", "ayudante", "user"].includes(role)) {
    return <AccountSettings />;
  }

  return <AppSettings />;
};

const HiddenOwnerRouteGate = ({ user, children }) => {
  const location = useLocation();

  if (
    user?.is_hidden_owner === true &&
    !["/settings", "/owner/clients"].some((allowed) => location.pathname.startsWith(allowed))
  ) {
    return <Navigate to="/settings" replace />;
  }

  return children;
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
