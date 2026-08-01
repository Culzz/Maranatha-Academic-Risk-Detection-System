/**
 * AdminDashboard — Admin portal layout shell with React Router nested routes.
 * Child pages are lazy-loaded for better initial load performance.
 */
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import DashboardLayout from "../../components/shared/DashboardLayout";

const PageFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-500" />
  </div>
);

const AdminOverview = lazy(() => import("./AdminOverview"));
const UserManagementPage = lazy(() => import("./UserManagementPage"));
const DepartmentRiskPage = lazy(() => import("./DepartmentRiskPage"));
const EnrollmentPage = lazy(() => import("./EnrollmentPage"));
const AuditLogPage = lazy(() => import("./AuditLogPage"));
const SessionManagerPage = lazy(() => import("./SessionManagerPage"));
const ModelPerformancePage = lazy(() => import("./ModelPerformancePage"));
const ProfilePage = lazy(() => import("../shared/ProfilePage"));
const SystemSettingsPage = lazy(() => import("./SystemSettingsPage"));
const EfficacyReportPage = lazy(() => import("./EfficacyReportPage"));
const StaffWorkloadPage = lazy(() => import("./StaffWorkloadPage"));
const SosDashboardPage = lazy(() => import("./SosDashboardPage"));
const TimetablePage = lazy(() => import("./TimetablePage"));
const HodDashboardPage = lazy(() => import("./HodDashboardPage"));
const DepartmentManagementPage = lazy(() => import("./DepartmentManagementPage"));
const RiskThermometerPage = lazy(() => import("./RiskThermometerPage"));
const CrossCourseRiskPage = lazy(() => import("./CrossCourseRiskPage"));
const LecturerEffectivenessPage = lazy(() => import("./LecturerEffectivenessPage"));
const AccreditationReportPage = lazy(() => import("./AccreditationReportPage"));
const SemesterPatternsPage = lazy(() => import("./SemesterPatternsPage"));
const AdminHelpPage = lazy(() => import("./AdminHelpPage"));

export default function AdminDashboard() {
  return (
    <DashboardLayout
      sidebar={AdminSidebar}
      footerText="Maranatha Academic Risk System — Institutional intelligence at your fingertips"
    >
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route index element={<AdminOverview />} />
          <Route path="users" element={<UserManagementPage />} />
          <Route path="department-risk" element={<DepartmentRiskPage />} />
          <Route path="enrollments" element={<EnrollmentPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="sessions" element={<SessionManagerPage />} />
          <Route path="model" element={<ModelPerformancePage />} />
          <Route path="settings" element={<SystemSettingsPage />} />
          <Route path="efficacy" element={<EfficacyReportPage />} />
          <Route path="workload" element={<StaffWorkloadPage />} />
          <Route path="sos" element={<SosDashboardPage />} />
          <Route path="timetable" element={<TimetablePage />} />
          <Route path="hod" element={<HodDashboardPage />} />
          <Route path="departments" element={<DepartmentManagementPage />} />
          <Route path="thermometer" element={<RiskThermometerPage />} />
          <Route path="cross-course" element={<CrossCourseRiskPage />} />
          <Route path="effectiveness" element={<LecturerEffectivenessPage />} />
          <Route path="accreditation" element={<AccreditationReportPage />} />
          <Route path="patterns" element={<SemesterPatternsPage />} />
          <Route path="help" element={<AdminHelpPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </DashboardLayout>
  );
}
