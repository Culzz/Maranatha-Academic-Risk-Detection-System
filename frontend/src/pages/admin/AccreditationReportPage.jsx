/**
 * AccreditationReportPage -- Accreditation evidence generator (Idea 15)
 * Compiles institution-wide stats into a printable accreditation report.
 * API: GET /analytics/accreditation-report
 */
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, Printer, RefreshCw, AlertCircle,
  Building2, ShieldCheck, Activity, Users, BarChart2, Lock,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";
import { useApi } from "../../hooks/useApi";

/* -- animation variants --------------------------------------------------- */
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

/* -- key-value row inside a section card ---------------------------------- */
function KvRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value ?? "--"}</span>
    </div>
  );
}

/* -- section card --------------------------------------------------------- */
function SectionCard({ icon: Icon, title, entries, iconColor, iconBg, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
    >
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon size={16} className={iconColor} />
        </div>
        <h2 className="font-serif text-lg font-bold text-slate-900">{title}</h2>
      </div>
      <div className="px-6 py-3">
        {entries.map(([label, value], i) => (
          <KvRow key={i} label={label} value={value} />
        ))}
      </div>
    </motion.div>
  );
}

/* -- helper: convert snake_case / camelCase keys to readable labels ------- */
function humanise(key) {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, c => c.toUpperCase());
}

/* -- turn an object into [label, value] pairs ----------------------------- */
function objectEntries(obj) {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([k, v]) => {
    const display = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "--");
    return [humanise(k), display];
  });
}

/* ========================================================================= */
export default function AccreditationReportPage() {
  const { token } = useAuth();
  const { data, loading, error, refetch: fetchData } = useApi(
    () => adminApi.getAccreditationReport(token),
    [token],
  );

  /* sections with their icons and colours */
  const sections = useMemo(() => {
    if (!data) return [];
    return [
      { key: "institution_stats",   title: "Institution Statistics",  icon: Building2,   iconColor: "text-primary",     iconBg: "bg-primary/10" },
      { key: "risk_identification", title: "Risk Identification",     icon: ShieldCheck, iconColor: "text-red-600",     iconBg: "bg-red-50" },
      { key: "intervention_stats",  title: "Interventions",           icon: Activity,    iconColor: "text-emerald-600", iconBg: "bg-emerald-50" },
      { key: "welfare_support",     title: "Welfare Support",         icon: Users,       iconColor: "text-blue-600",    iconBg: "bg-blue-50" },
      { key: "system_usage",        title: "System Usage",            icon: BarChart2,   iconColor: "text-amber-600",   iconBg: "bg-amber-50" },
      { key: "data_privacy",        title: "Data Privacy",            icon: Lock,        iconColor: "text-slate-600",   iconBg: "bg-slate-100" },
    ].filter(s => data[s.key]);
  }, [data]);

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* -- Header -------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
              <ClipboardList size={18} className="text-slate-400" />
            </div>
            <h1 className="font-serif text-4xl font-bold text-slate-900 leading-tight">
              Accreditation Evidence Report
            </h1>
          </div>
          <p className="text-lg text-slate-500">
            Auto-generated evidence of student support activities for accreditation panels
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => window.print()}
            className="flex items-center gap-2 bg-primary text-white text-sm font-medium px-4 h-10 rounded-xl transition-all hover:opacity-90">
            <Printer size={13} /> Print Report
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={fetchData}
            className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all">
            <RefreshCw size={13} /> Refresh
          </motion.button>
        </div>
      </div>

      {/* -- Error banner -------------------------------------------------- */}
      <AnimatePresence>
        {error && (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* -- Loading / Empty / Content ------------------------------------- */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <ClipboardList size={32} className="mb-3 opacity-30" />
          <p className="text-sm">No accreditation report data available</p>
          <p className="text-xs mt-1">The report will be generated once sufficient system activity exists</p>
        </div>
      ) : (
        <>
          {/* == Timestamp + Session Label ================================= */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 flex-wrap">
            {data.generated_at && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full">
                Generated: {new Date(data.generated_at).toLocaleString()}
              </span>
            )}
            {data.academic_session && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/5 border border-primary/20 px-3 py-1.5 rounded-full">
                Session: {data.academic_session}
              </span>
            )}
          </motion.div>

          {/* == Section Cards ============================================= */}
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {sections.map((s, i) => (
              <SectionCard
                key={s.key}
                icon={s.icon}
                title={s.title}
                entries={objectEntries(data[s.key])}
                iconColor={s.iconColor}
                iconBg={s.iconBg}
                delay={i * 0.07}
              />
            ))}
          </motion.div>

          {/* -- Footer ----------------------------------------------------- */}
          <p className="text-xs text-slate-400 text-center print:mt-8">
            This document was automatically generated by the Maranatha Academic Risk Detection System.
            Data is aggregated and anonymised where required. For queries, contact the system administrator.
          </p>
        </>
      )}
    </div>
  );
}
