/**
 * AdminSidebar — Admin portal navigation.
 * Thin wrapper around BaseSidebar with admin-specific nav config.
 * Filters visible items based on admin_level (dap > dean > hod).
 */
import {
  LayoutDashboard, Users, BarChart2,
  BookOpen, ClipboardList, Shield,
  Calendar, Activity, Settings, AlertTriangle, Clock, TrendingUp,
  Building2, Thermometer, GitBranch,
  GraduationCap, FileText, History, HelpCircle,
} from "lucide-react";
import BaseSidebar from "../../components/shared/BaseSidebar";
import { useAuth } from "../../context/AuthContext";

const HIERARCHY = { hod: 1, dean: 2, dap: 3 };

const NAV = [
  {
    section: "Overview",
    items: [
      { path: "/admin",       label: "Dashboard",  icon: LayoutDashboard, end: true },
      { path: "/admin/audit", label: "Audit Log",  icon: Shield, minLevel: "dap" },
    ],
  },
  {
    section: "Management",
    items: [
      { path: "/admin/users",          label: "User Accounts",   icon: Users, minLevel: "dean" },
      { path: "/admin/department-risk", label: "Department Risk", icon: BarChart2 },
      { path: "/admin/enrollments",     label: "Enrollments",     icon: ClipboardList, minLevel: "dean" },
      { path: "/admin/departments",     label: "Departments",     icon: BookOpen, minLevel: "dean" },
      { path: "/admin/hod",            label: "HOD Dashboard",   icon: Building2 },
    ],
  },
  {
    section: "System",
    items: [
      { path: "/admin/sessions",  label: "Academic Sessions", icon: Calendar, minLevel: "dean" },
      { path: "/admin/model",     label: "Model Performance", icon: Activity, minLevel: "dap" },
      { path: "/admin/settings",  label: "System Settings",   icon: Settings, minLevel: "dap" },
      { path: "/admin/timetable", label: "Timetable",         icon: Clock },
    ],
  },
  {
    section: "Analytics",
    items: [
      { path: "/admin/efficacy",       label: "Efficacy Report",   icon: TrendingUp },
      { path: "/admin/workload",       label: "Staff Workload",    icon: Users, minLevel: "dean" },
      { path: "/admin/sos",            label: "SOS Dashboard",     icon: AlertTriangle },
      { path: "/admin/thermometer",    label: "Health Monitor",    icon: Thermometer },
      { path: "/admin/cross-course",   label: "Cross-Course Risk", icon: GitBranch },
      { path: "/admin/effectiveness",  label: "Lecturer Impact",   icon: GraduationCap },
      { path: "/admin/accreditation",  label: "Accreditation",     icon: FileText, minLevel: "dean" },
      { path: "/admin/patterns",       label: "Semester Patterns", icon: History },
    ],
  },
  {
    section: "Support",
    items: [
      { path: "/admin/help", label: "Help & Docs", icon: HelpCircle },
    ],
  },
];

export default function AdminSidebar(props) {
  const { user } = useAuth();
  const level = user?.admin_level || "dap"; // default to full access if not set
  const userRank = HIERARCHY[level] || 3;

  const filteredNav = NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.minLevel || userRank >= (HIERARCHY[item.minLevel] || 0)
    ),
  })).filter((section) => section.items.length > 0);

  return <BaseSidebar {...props} navSections={filteredNav} roleName="Admin" />;
}
