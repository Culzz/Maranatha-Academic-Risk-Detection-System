/**
 * Sidebar — Student navigation sidebar.
 * Thin wrapper around BaseSidebar with student-specific nav config.
 */
import {
  LayoutDashboard, Activity, ClipboardList, MessageSquare,
  BookOpen, CalendarDays, Clock,
  CheckSquare, Calendar, TrendingDown, Users, MessagesSquare,
  Heart, FileText, GraduationCap, Lightbulb, Mic,
  Shield, Sparkles, Compass, RotateCcw, Trophy, HelpCircle,
} from "lucide-react";
import BaseSidebar from "./BaseSidebar";

const NAV = [
  {
    section: "Dashboard",
    items: [
      { path: "/student",            label: "Overview",      icon: LayoutDashboard, end: true },
      { path: "/student/engagement", label: "Engagement",    icon: Activity },
      { path: "/student/attendance", label: "Attendance",    icon: CalendarDays },
    ],
  },
  {
    section: "Academics",
    items: [
      { path: "/student/roadmap",     label: "My Day",        icon: Compass },
      { path: "/student/assignments", label: "Assignments",   icon: BookOpen },
      { path: "/student/quizzes",     label: "Quizzes",       icon: ClipboardList },
      { path: "/student/spaced-rep",  label: "Daily Review",  icon: RotateCcw },
      { path: "/student/materials",       label: "Materials",      icon: FileText },
      { path: "/student/lecture-notes",  label: "Lecture Notes",  icon: Mic },
      { path: "/student/shared-notes",   label: "Shared Notes",   icon: Users },
      { path: "/student/tutor",          label: "Course Tutor",   icon: MessageSquare },
      { path: "/student/self-study",  label: "Self Study",    icon: Lightbulb },
      { path: "/student/todo",        label: "To-Do List",    icon: CheckSquare },
      { path: "/student/schedule",    label: "Schedule",      icon: Calendar },
      { path: "/student/timetable",   label: "Timetable",     icon: CalendarDays },
      { path: "/student/results",     label: "Results",       icon: GraduationCap },
      { path: "/student/portfolio",   label: "My Portfolio",  icon: Trophy },
    ],
  },
  {
    section: "Wellbeing",
    items: [
      { path: "/student/checkin",      label: "Check-In",       icon: Heart },
      { path: "/student/recovery",     label: "Recovery Path",  icon: TrendingDown },
      { path: "/student/peer-study",   label: "Study Groups",   icon: Users },
      { path: "/student/office-hours", label: "Office Hours",   icon: Clock },
      { path: "/student/insights",     label: "Peer Insights",  icon: Sparkles },
      { path: "/student/guardian",     label: "Guardian Portal", icon: Shield },
    ],
  },
  {
    section: "Community",
    items: [
      { path: "/student/chat", label: "Chat", icon: MessagesSquare },
      { path: "/student/solidarity", label: "Solidarity Wall", icon: Heart },
      { path: "/student/semester-capsule", label: "Semester Capsule", icon: Trophy },
    ],
  },
  {
    section: "Support",
    items: [
      { path: "/student/help", label: "Help & FAQ", icon: HelpCircle },
    ],
  },
];

export default function Sidebar(props) {
  return <BaseSidebar {...props} navSections={NAV} roleName="Student" />;
}
