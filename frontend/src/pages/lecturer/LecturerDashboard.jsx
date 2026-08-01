/**
 * LecturerDashboard — nested routes with shared layout.
 * Child pages are lazy-loaded for better initial load performance.
 */
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LecturerSidebar from "../../components/shared/LecturerSidebar";
import DashboardLayout from "../../components/shared/DashboardLayout";
import OnboardingModal from "../../components/OnboardingModal";
import { useAuth } from "../../context/AuthContext";

const PageFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-500" />
  </div>
);

const LecturerOverview = lazy(() => import("./LecturerOverview"));
const CourseStudentsPage = lazy(() => import("./CourseStudentsPage"));
const AttendanceMgmtPage = lazy(() => import("./AttendanceMgmtPage"));
const QuizManagementPage = lazy(() => import("./QuizManagementPage"));
const AssignmentMgmtPage = lazy(() => import("./AssignmentMgmtPage"));
const MaterialsPage = lazy(() => import("./MaterialsPage"));
const InterventionsPage = lazy(() => import("./InterventionsPage"));
const ProfilePage = lazy(() => import("../shared/ProfilePage"));
const PulseDashboardPage = lazy(() => import("./PulseDashboardPage"));
const BroadcastPage = lazy(() => import("./BroadcastPage"));
const EngagementHeatmapPage = lazy(() => import("./EngagementHeatmapPage"));
const LecturerChatPage = lazy(() => import("./LecturerChatPage"));
const LecturerTimetablePage = lazy(() => import("./LecturerTimetablePage"));
const OfficeHoursPage = lazy(() => import("./OfficeHoursPage"));
const LecturerHelpPage = lazy(() => import("./LecturerHelpPage"));

export default function LecturerDashboard() {
  const { user } = useAuth();

  return (
    <DashboardLayout
      sidebar={LecturerSidebar}
      footerText="Maranatha Academic Risk System — Nurturing academic excellence"
    >
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route index element={<LecturerOverview />} />
          <Route path="students"      element={<CourseStudentsPage />} />
          <Route path="attendance"    element={<AttendanceMgmtPage />} />
          <Route path="quizzes"       element={<QuizManagementPage />} />
          <Route path="assignments"   element={<AssignmentMgmtPage />} />
          <Route path="materials"     element={<MaterialsPage />} />
          <Route path="interventions" element={<InterventionsPage />} />
          <Route path="pulse"         element={<PulseDashboardPage />} />
          <Route path="broadcast"     element={<BroadcastPage />} />
          <Route path="heatmap"       element={<EngagementHeatmapPage />} />
          <Route path="chat"          element={<LecturerChatPage />} />
          <Route path="timetable"     element={<LecturerTimetablePage />} />
          <Route path="office-hours"  element={<OfficeHoursPage />} />
          <Route path="help"          element={<LecturerHelpPage />} />
          <Route path="profile"       element={<ProfilePage />} />
          <Route path="*"             element={<Navigate to="/lecturer" replace />} />
        </Routes>
      </Suspense>
      <OnboardingModal userId={user?.user_id} userName={user?.full_name} role="lecturer" />
    </DashboardLayout>
  );
}
