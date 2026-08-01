/**
 * BaseSidebar — Shared sidebar shell for all portals.
 * Collapsible section groups, top-mounted collapse toggle,
 * profile footer with popup menu (Settings / My Profile / Sign Out).
 */
import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronsLeft, X, ChevronDown,
  User, Settings, LogOut,
} from "lucide-react";
import crest from "../../assets/maranatha-crest.png";
import { initials } from "../../utils/helpers";

export default function BaseSidebar({
  user,
  navSections,
  isOpen,
  onClose,
  onLogout,
  collapsed,
  onToggleCollapse,
  roleName,
}) {
  const navigate = useNavigate();
  const role = user?.role || "student";
  const basePath = role === "lecturer" ? "/lecturer" : role === "admin" ? "/admin" : "/student";

  /* ── Collapsible section state ──────────────────────────── */
  const [expandedSections, setExpandedSections] = useState(() =>
    Object.fromEntries(navSections.map((s) => [s.section, true]))
  );
  const toggleSection = (section) =>
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));

  /* ── Profile popup menu ─────────────────────────────────── */
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    if (!profileOpen) return;
    function handleClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  const goTo = (path) => {
    navigate(path);
    setProfileOpen(false);
    onClose?.();
  };

  /* ── Avatar helper ──────────────────────────────────────── */
  const Avatar = ({ size = "w-10 h-10", textSize = "text-sm" }) =>
    user?.profile_picture_url ? (
      <img
        src={user.profile_picture_url}
        alt=""
        className={`${size} rounded-full object-cover flex-shrink-0`}
      />
    ) : (
      <div
        className={`${size} rounded-full bg-primary flex items-center justify-center flex-shrink-0`}
      >
        <span className={`text-accent font-bold ${textSize}`}>
          {initials(user?.full_name || "MU")}
        </span>
      </div>
    );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        role="navigation"
        className={[
          "fixed top-0 left-0 h-screen z-50 flex flex-col",
          "bg-surface-bg",
          "transition-all duration-300 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:translate-x-0 lg:w-16" : "lg:translate-x-0 lg:w-56",
          "w-64",
        ].join(" ")}
      >
        {/* ── Brand header ─ h-16 to match Topbar ─────────── */}
        <div className="h-16 bg-primary flex items-center gap-3 px-4 flex-shrink-0">
          <button
            onClick={collapsed ? onToggleCollapse : undefined}
            className="flex-shrink-0"
            title={collapsed ? "Expand sidebar" : undefined}
          >
            <img
              src={crest}
              alt="Maranatha University"
              className="w-8 h-8 object-contain"
            />
          </button>

          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm text-white font-serif font-semibold leading-tight truncate">
                  Maranatha University
                </h1>
              </div>
              <button
                onClick={onToggleCollapse}
                className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
                title="Collapse sidebar"
              >
                <ChevronsLeft size={16} />
              </button>
            </>
          )}

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all flex-shrink-0 ml-auto"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Navigation with collapsible groups ──────────── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-thin">
          {navSections.map(({ section, items }) => (
            <div key={section} className="mb-1">
              {/* Section heading — clickable toggle */}
              {!collapsed ? (
                <button
                  onClick={() => toggleSection(section)}
                  className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <span>{section}</span>
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-200 ${
                      expandedSections[section] ? "" : "-rotate-90"
                    }`}
                  />
                </button>
              ) : (
                <div className="h-px bg-slate-200/60 mx-3 my-2" />
              )}

              {/* Nav items — animated expand/collapse */}
              <AnimatePresence initial={false}>
                {(collapsed || expandedSections[section]) && (
                  <motion.div
                    key={section}
                    initial={collapsed ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-0.5 px-2">
                      {items.map(({ path, label, icon: Icon, end }) => (
                        <NavLink
                          key={path}
                          to={path}
                          end={end}
                          onClick={() => onClose?.()}
                          title={collapsed ? label : undefined}
                          className={({ isActive }) =>
                            [
                              "flex items-center gap-3 rounded-xl transition-all duration-150 group relative font-semibold",
                              collapsed ? "justify-center p-2.5" : "px-3 py-2",
                              isActive
                                ? "bg-primary text-white shadow-sm"
                                : "text-slate-500 hover:text-primary hover:bg-slate-100",
                            ].join(" ")
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <Icon
                                size={16}
                                className={[
                                  "flex-shrink-0 transition-colors",
                                  isActive
                                    ? "text-gold-400"
                                    : "text-slate-400 group-hover:text-primary",
                                ].join(" ")}
                              />
                              {!collapsed && (
                                <span className="text-sm flex-1 truncate">
                                  {label}
                                </span>
                              )}
                              {!collapsed && isActive && (
                                <span className="w-0.5 h-4 rounded-full bg-gold-400 flex-shrink-0" />
                              )}
                              {collapsed && (
                                <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-primary text-white text-xs font-medium rounded-lg whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                                  {label}
                                </span>
                              )}
                            </>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </nav>

        {/* ── Profile footer ──────────────────────────────── */}
        <div className="flex-shrink-0 relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className={[
              "w-full flex items-center gap-3 hover:bg-slate-50 transition-colors border-t border-surface-border",
              collapsed ? "justify-center px-2 py-3" : "px-4 py-3",
            ].join(" ")}
          >
            <Avatar
              size={collapsed ? "w-8 h-8" : "w-10 h-10"}
              textSize={collapsed ? "text-xs" : "text-sm"}
            />
            {!collapsed && (
              <div className="min-w-0 flex-1 text-left">
                <p className="text-sm font-bold text-primary truncate leading-tight">
                  {user?.full_name?.split(" ").slice(0, 2).join(" ") || roleName}
                </p>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {roleName}
                </span>
              </div>
            )}
          </button>

          {/* Profile popup menu */}
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
                className={[
                  "absolute bottom-full mb-2 bg-white border border-slate-200 rounded-xl shadow-xl z-[60] overflow-hidden",
                  collapsed ? "left-2 w-48" : "left-3 right-3",
                ].join(" ")}
              >
                <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100">
                  <p className="text-sm font-bold text-primary truncate">
                    {user?.full_name || roleName}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {user?.email || user?.matric_number || user?.staff_id || ""}
                  </p>
                </div>
                <button
                  onClick={() => goTo(`${basePath}/profile`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <User size={14} className="text-slate-400" />
                  My Profile
                </button>
                <button
                  onClick={() => goTo(`${basePath}/profile?tab=preferences`)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Settings size={14} className="text-slate-400" />
                  Settings
                </button>
                <div className="border-t border-slate-100" />
                <button
                  onClick={() => {
                    onLogout?.();
                    setProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} className="text-red-400" />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>
    </>
  );
}
