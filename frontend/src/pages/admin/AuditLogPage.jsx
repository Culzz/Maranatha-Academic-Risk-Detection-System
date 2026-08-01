/**
 * AuditLogPage — Risk profile access audit trail
 * Real API: GET /risk/audit-log
 */
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Shield, Search, RefreshCw, AlertCircle,
  Eye, GraduationCap, Users,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { useApi } from "../../hooks/useApi";

const c  = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const it = { hidden: { opacity: 0, x: -4 }, show: { opacity: 1, x: 0, transition: { duration: 0.2 } } };

function formatDateTime(dt) {
  if (!dt) return "—";
  try {
    const d = new Date(dt);
    return d.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return dt; }
}

const ACTION_META = {
  view_risk_profile: { label: "Viewed risk profile", icon: Eye, color: "text-blue-600 bg-blue-50 border-blue-200" },
};

const ROLE_COLOR = {
  lecturer: "text-primary    bg-primary/10 border-primary/20",
  admin:    "text-amber-600 bg-amber-50   border-amber-200",
  student:  "text-slate-500 bg-slate-100  border-slate-200",
};

export default function AuditLogPage() {
  const { token }              = useAuth();
  const [query,   setQuery]    = useState("");
  const [limit,   setLimit]    = useState(100);

  const { data: rawLogs, loading, error, refetch: fetchLogs } = useApi(
    () => api.get(`/admin/audit-log?limit=${limit}`, { token }),
    [token, limit],
  );
  const logs = Array.isArray(rawLogs) ? rawLogs : rawLogs?.items || [];

  const filtered = logs.filter(l => {
    const q = query.toLowerCase();
    return !q
      || l.actor.toLowerCase().includes(q)
      || l.resource_id?.toString().includes(q)
      || l.action.includes(q);
  });

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Audit Log</h1>
          <p className="text-lg text-slate-500">Every risk profile access is recorded for compliance and data protection</p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={fetchLogs}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all">
          <RefreshCw size={13} /> Refresh
        </motion.button>
      </div>

      {/* NDPR notice */}
      <div className="flex items-start gap-4 bg-slate-50 border border-slate-200 rounded-xl p-5">
        <div className="w-10 h-10 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Shield size={18} className="text-primary" />
        </div>
        <div>
          <p className="font-semibold text-slate-900 text-sm mb-1">NDPR Compliance Audit Trail</p>
          <p className="text-slate-400 text-sm">
            This log records every instance where a staff member accessed a student's academic risk profile.
            It is maintained in accordance with the Nigerian Data Protection Regulation (NDPR) and
            Maranatha University's data governance policy.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input name="audit-search" aria-label="Search audit log" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search actor, student ID..."
            className="w-full h-10 pl-8 pr-3 bg-white border border-slate-200 rounded-xl text-sm outline-none
              focus:ring-2 focus:ring-accent/15 focus:border-accent/40 placeholder:text-slate-400" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Show:</span>
          {[50, 100, 250].map(n => (
            <button key={n} onClick={() => setLimit(n)}
              className={[
                "text-xs font-semibold px-3 h-8 rounded-xl border transition-all",
                limit === n ? "bg-primary text-white border-primary" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300",
              ].join(" ")}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Shield size={28} className="mb-3 opacity-30" />
            <p className="text-sm">{logs.length === 0 ? "No audit events yet" : "No events match your search"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ds-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Actor</th>
                  <th className="text-left hidden sm:table-cell">Role</th>
                  <th className="text-left">Action</th>
                  <th className="text-left hidden md:table-cell">Student ID</th>
                  <th className="text-left hidden lg:table-cell">Detail</th>
                  <th className="text-left hidden sm:table-cell">IP Address</th>
                  <th className="text-left">Timestamp</th>
                </tr>
              </thead>
              <motion.tbody variants={c} initial="hidden" animate="show">
                {filtered.map((l, i) => {
                  const actionMeta = ACTION_META[l.action] || { label: l.action, icon: Eye, color: "text-slate-600 bg-slate-100 border-slate-200" };
                  const ActionIcon = actionMeta.icon;
                  const roleColor  = ROLE_COLOR[l.actor_role] || ROLE_COLOR.student;
                  return (
                    <motion.tr key={i} variants={it}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-accent font-bold text-[10px] flex-shrink-0">
                            {l.actor.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                          </div>
                          <span className="font-semibold text-slate-900 text-sm truncate max-w-[120px]">{l.actor}</span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg border capitalize ${roleColor}`}>
                          {l.actor_role}
                        </span>
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg border ${actionMeta.color}`}>
                          <ActionIcon size={11} /> {actionMeta.label}
                        </span>
                      </td>
                      <td className="text-slate-500 font-mono text-xs hidden md:table-cell">
                        {l.resource_id ? l.resource_id.toString().slice(0, 8) + "..." : "—"}
                      </td>
                      <td className="text-slate-400 text-xs hidden lg:table-cell">
                        {l.detail?.weeks_returned != null
                          ? `${l.detail.weeks_returned} weeks returned`
                          : JSON.stringify(l.detail || {})
                        }
                      </td>
                      <td className="text-slate-400 text-xs hidden sm:table-cell font-mono">
                        {l.ip_address || "—"}
                      </td>
                      <td className="text-slate-500 text-xs whitespace-nowrap">
                        {formatDateTime(l.performed_at)}
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Showing {filtered.length} of {logs.length} audit entries · Last {limit} records fetched
      </p>
    </div>
  );
}
