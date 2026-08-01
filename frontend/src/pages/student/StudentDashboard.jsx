import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "../../components/shared/Sidebar";
import DashboardLayout from "../../components/shared/DashboardLayout";
import { useSessionTimer } from "../../hooks/useSessionTimer";
import OnboardingModal from "../../components/OnboardingModal";
import { useAuth } from "../../context/AuthContext";

const PageFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-500" />
  </div>
);

const OverviewPage = lazy(() => import("./OverviewPage"));
const EngagementPage = lazy(() => import("./EngagementPage"));
const AttendancePage = lazy(() => import("./AttendancePage"));
const AssignmentsPage = lazy(() => import("./AssignmentsPage"));
const QuizzesPage = lazy(() => import("./QuizzesPage"));
const TutorPage = lazy(() => import("./TutorPage"));
const ProfilePage = lazy(() => import("../shared/ProfilePage"));
const TodoPage = lazy(() => import("./TodoPage"));
const SchedulePage = lazy(() => import("./SchedulePage"));
const RecoveryPathPage = lazy(() => import("./RecoveryPathPage"));
const PeerStudyPage = lazy(() => import("./PeerStudyPage"));
const ChatPage = lazy(() => import("./ChatPage"));
const CheckinPage = lazy(() => import("./CheckinPage"));
const StudentMaterialsPage = lazy(() => import("./StudentMaterialsPage"));
const TimetablePage = lazy(() => import("./TimetablePage"));
const ResultsPage = lazy(() => import("./ResultsPage"));
const OfficeHoursPage = lazy(() => import("./OfficeHoursPage"));
const SelfStudyPage = lazy(() => import("./SelfStudyPage"));
const MaterialViewerPage = lazy(() => import("./MaterialViewerPage"));
const RoadmapPage = lazy(() => import("./RoadmapPage"));
const SpacedRepPage = lazy(() => import("./SpacedRepPage"));
const PortfolioPage = lazy(() => import("./PortfolioPage"));
const AnonymousInsightsPage = lazy(() => import("./AnonymousInsightsPage"));
const GuardianPortalPage = lazy(() => import("./GuardianPortalPage"));
const StudentHelpPage = lazy(() => import("./StudentHelpPage"));
const LectureNotesPage = lazy(() => import("./LectureNotesPage"));
const SharedNotesPage = lazy(() => import("./SharedNotesPage"));
const SolidarityWallPage = lazy(() => import("./SolidarityWallPage"));
const SemesterCapsulePage = lazy(() => import("./SemesterCapsulePage"));

export default function StudentDashboard() {
  const { user } = useAuth();
  useSessionTimer();

  return (
    <DashboardLayout
      sidebar={Sidebar}
      footerText="Maranatha Academic Risk System — Empowering your academic journey"
    >
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route index element={<OverviewPage />} />
          <Route path="engagement" element={<EngagementPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="quizzes" element={<QuizzesPage />} />
          <Route path="tutor" element={<TutorPage />} />
          <Route path="todo" element={<TodoPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="recovery" element={<RecoveryPathPage />} />
          <Route path="peer-study" element={<PeerStudyPage />} />
          <Route path="checkin" element={<CheckinPage />} />
          <Route path="materials" element={<StudentMaterialsPage />} />
          <Route path="materials/:id/view" element={<MaterialViewerPage />} />
          <Route path="lecture-notes" element={<LectureNotesPage />} />
          <Route path="shared-notes" element={<SharedNotesPage />} />
          <Route path="timetable" element={<TimetablePage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="office-hours" element={<OfficeHoursPage />} />
          <Route path="self-study" element={<SelfStudyPage />} />
          <Route path="roadmap" element={<RoadmapPage />} />
          <Route path="spaced-rep" element={<SpacedRepPage />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="insights" element={<AnonymousInsightsPage />} />
          <Route path="guardian" element={<GuardianPortalPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="solidarity" element={<SolidarityWallPage />} />
          <Route path="semester-capsule" element={<SemesterCapsulePage />} />
          <Route path="help" element={<StudentHelpPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/student" replace />} />
        </Routes>
      </Suspense>
      <OnboardingModal userId={user?.user_id} userName={user?.full_name} />
    </DashboardLayout>
  );
}
