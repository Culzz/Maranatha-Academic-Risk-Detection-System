/**
 * LecturerSidebar — Lecturer portal navigation.
 * Thin wrapper around BaseSidebar with lecturer-specific nav config.
 */
import {
  LayoutDashboard, Users, CalendarCheck, ClipboardList,
  FileText, Upload, Bell, Clock,
  Activity, Send, Grid, MessagesSquare, CalendarDays, HelpCircle,
} from "lucide-react";
import BaseSidebar from "./BaseSidebar";

const NAV = [
  {
    section: "Overview",
    items: [
      { path: "/lecturer",               label: "Dashboard",       icon: LayoutDashboard, end: true },
      { path: "/lecturer/interventions",  label: "Interventions",   icon: Bell },
    ],
  },
  {
    section: "Course Management",
    items: [
      { path: "/lecturer/students",      label: "Students & Risk",  icon: Users },
      { path: "/lecturer/attendance",    label: "Attendance",       icon: CalendarCheck },
      { path: "/lecturer/quizzes",       label: "Quizzes",          icon: ClipboardList },
      { path: "/lecturer/assignments",   label: "Assignments",      icon: FileText },
      { path: "/lecturer/materials",     label: "Course Materials", icon: Upload },
      { path: "/lecturer/timetable",     label: "Timetable",        icon: CalendarDays },
      { path: "/lecturer/office-hours",  label: "Office Hours",     icon: Clock },
    ],
  },
  {
    section: "Analytics",
    items: [
      { path: "/lecturer/pulse",     label: "Student Pulse",    icon: Activity },
      { path: "/lecturer/broadcast", label: "Broadcast",        icon: Send },
      { path: "/lecturer/heatmap",   label: "Engagement Map",   icon: Grid },
    ],
  },
  {
    section: "Communication",
    items: [
      { path: "/lecturer/chat", label: "Chat", icon: MessagesSquare },
    ],
  },
  {
    section: "Support",
    items: [
      { path: "/lecturer/help", label: "Help & Docs", icon: HelpCircle },
    ],
  },
];

export default function LecturerSidebar(props) {
  return <BaseSidebar {...props} navSections={NAV} roleName="Lecturer" />;
}
