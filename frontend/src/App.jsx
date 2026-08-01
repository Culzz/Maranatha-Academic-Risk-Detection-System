/**
 * App.jsx — React Router v6 based routing
 * Routes: / (landing), /login, /register, /student/*, /lecturer/*, /admin/*
 * Role-based redirect after login. Protected routes with auth guard.
 * Dashboards are lazy-loaded for code splitting.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { RealtimeProvider } from "./context/RealtimeContext";
import { ThemeProvider } from "./context/ThemeContext";
import { LayoutProvider } from "./context/LayoutContext";
import MaintenanceBanner from "./components/shared/MaintenanceBanner";
import OfflineBanner from "./components/shared/OfflineBanner";
import InstallPrompt from "./components/shared/InstallPrompt";
import SosButton from "./components/shared/SosButton";
import ScreenReaderAnnouncer from "./components/ui/ScreenReaderAnnouncer";

import LandingPage from "./pages/public/LandingPage";
import LoginPage from "./pages/public/LoginPage";
import RegisterPage from "./pages/public/RegisterPage";
import LecturerRegisterPage from "./pages/public/LecturerRegisterPage";
import AdminRegisterPage from "./pages/public/AdminRegisterPage";
import ConfirmEmailPage from "./pages/public/ConfirmEmailPage";
import ResetPasswordPage from "./pages/public/ResetPasswordPage";
import MfaVerifyPage from "./pages/public/MfaVerifyPage";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";

// Lazy-loaded dashboards — each becomes a separate chunk
const StudentDashboard = lazy(() => import("./pages/student/StudentDashboard"));
const LecturerDashboard = lazy(() => import("./pages/lecturer/LecturerDashboard"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));

const DASHBOARD = { student: "/student", lecturer: "/lecturer", admin: "/admin" };

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-navy-700 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-500 font-medium">Loading...</span>
      </div>
    </div>
  );
}

function GlobalApiErrorToast() {
  const [event, setEvent] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      const detail = e.detail || {};
      let message = "Something went wrong on the server. Please try again shortly.";
      if (detail.status === 503) {
        message = "System maintenance is in progress. Please try again shortly.";
      } else if (detail.status === 0) {
        message = "The server could not be reached. Some data may be temporarily unavailable.";
      }

      setEvent({
        id: Date.now(),
        title: "Connection issue",
        message,
      });
    };

    window.addEventListener("api:server-error", handler);
    return () => window.removeEventListener("api:server-error", handler);
  }, []);

  useEffect(() => {
    if (!event) return undefined;
    const timer = setTimeout(() => setEvent(null), 5000);
    return () => clearTimeout(timer);
  }, [event]);

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          key={event.id}
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 80, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-6 right-6 z-50 flex items-start gap-3 max-w-[calc(100vw-3rem)] sm:max-w-sm w-full bg-white border border-amber-200 rounded-xl shadow-lg px-4 py-3"
        >
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0 py-0.5">
            <p className="text-sm font-semibold text-primary">{event.title}</p>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{event.message}</p>
          </div>
          <button
            onClick={() => setEvent(null)}
            className="flex-shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Routes>
      {/* Public routes — redirect to dashboard if already authenticated */}
      <Route
        path="/"
        element={
          isAuthenticated
            ? <Navigate to={DASHBOARD[user?.role] || "/student"} replace />
            : <LandingPage />
        }
      />
      <Route
        path="/login"
        element={
          isAuthenticated
            ? <Navigate to={DASHBOARD[user?.role] || "/student"} replace />
            : <LoginPage />
        }
      />
      <Route
        path="/register"
        element={
          isAuthenticated
            ? <Navigate to={DASHBOARD[user?.role] || "/student"} replace />
            : <RegisterPage />
        }
      />
      <Route
        path="/register/student"
        element={
          isAuthenticated
            ? <Navigate to={DASHBOARD[user?.role] || "/student"} replace />
            : <RegisterPage />
        }
      />
      <Route
        path="/register/lecturer"
        element={
          isAuthenticated
            ? <Navigate to={DASHBOARD[user?.role] || "/student"} replace />
            : <LecturerRegisterPage />
        }
      />
      <Route path="/register/admin" element={<AdminRegisterPage />} />
      <Route path="/confirm-email" element={<ConfirmEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/mfa-verify" element={<MfaVerifyPage />} />

      {/* Protected routes — lazy-loaded dashboards */}
      <Route
        path="/student/*"
        element={
          <ProtectedRoute allowedRoles={["student"]}>
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <StudentDashboard />
              </Suspense>
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/lecturer/*"
        element={
          <ProtectedRoute allowedRoles={["lecturer"]}>
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <LecturerDashboard />
              </Suspense>
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <AdminDashboard />
              </Suspense>
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <LayoutProvider>
            <AuthProvider>
              <NotificationProvider>
                <RealtimeProvider>
                  <ScreenReaderAnnouncer />
                  <OfflineBanner />
                  <GlobalApiErrorToast />
                  <MaintenanceBanner />
                  <AppRoutes />
                  <SosButton />
                  <InstallPrompt />
                </RealtimeProvider>
              </NotificationProvider>
            </AuthProvider>
          </LayoutProvider>
        </ThemeProvider>
      </MotionConfig>
    </BrowserRouter>
  );
}
