/**
 * UserDropdown — avatar dropdown in the topbar.
 * Click avatar → My Profile, Settings, Sign Out.
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { User, Settings, LogOut, ChevronDown } from "lucide-react";
import { initials } from "../../utils/helpers";

export default function UserDropdown({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const role = user?.role || "student";
  const basePath = role === "lecturer" ? "/lecturer" : role === "admin" ? "/admin" : "/student";

  const menuItems = [
    {
      label: "My Profile",
      icon: User,
      action: () => { navigate(`${basePath}/profile`); setOpen(false); },
    },
    {
      label: "Settings",
      icon: Settings,
      action: () => { navigate(`${basePath}/profile?tab=preferences`); setOpen(false); },
    },
  ];

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 cursor-pointer group"
        aria-label="User menu"
        aria-expanded={open}
      >
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-primary truncate max-w-[120px] leading-tight">
            {user?.full_name || "User"}
          </p>
          <p className="text-xs text-slate-400 truncate max-w-[120px]">
            {user?.matric_number || user?.staff_id || user?.role || ""}
          </p>
        </div>
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ring-2 ring-transparent group-hover:ring-accent/20 transition-all overflow-hidden">
          {user?.profile_picture_url ? (
            <img src={user.profile_picture_url} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center">
              <span className="text-accent font-bold text-xs">
                {initials(user?.full_name || "U")}
              </span>
            </div>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 hidden sm:block ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl border border-slate-100 shadow-premium-lg overflow-hidden z-50"
          >
            {/* User header */}
            <div className="px-4 py-3.5 bg-slate-50/80 border-b border-slate-100">
              <p className="text-sm font-semibold text-primary truncate">
                {user?.full_name || "User"}
              </p>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {user?.email || ""}
              </p>
            </div>

            {/* Menu items */}
            <div className="py-1.5">
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors text-left"
                >
                  <item.icon className="w-4 h-4 text-slate-400" />
                  {item.label}
                </button>
              ))}
            </div>

            {/* Sign Out */}
            <div className="border-t border-slate-100 py-1.5">
              <button
                onClick={() => { onLogout?.(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-risk-high hover:bg-red-50 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
