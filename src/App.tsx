import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { KioskPage } from './pages/KioskPage';
import { DashboardLayout } from './components/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { PrinterPage } from './pages/PrinterPage';
import { SettingsPage } from './pages/SettingsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { RequireAuth } from './components/RequireAuth';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LandingPage />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          }
        />

        {/* Shell sections share the persistent sidebar layout */}
        <Route
          path="/app"
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="printer" element={<PrinterPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Kiosk is full-screen — a sibling route, NOT under the layout */}
        <Route
          path="/app/events/:id"
          element={
            <RequireAuth>
              <KioskPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
