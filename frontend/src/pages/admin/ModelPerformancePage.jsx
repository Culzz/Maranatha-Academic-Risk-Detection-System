/**
 * ModelPerformancePage — XGBoost model monitoring and retraining
 * G8: Shows accuracy metrics and allows manual retrain trigger.
 * API: GET /admin/model/performance, POST /admin/model/retrain
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, RefreshCw, AlertCircle, CheckCircle,
  TrendingUp, BarChart2, Zap, Info,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { api } from "../../services/api";
import { useApi, useMutation } from "../../hooks/useApi";

function MetricCard({ label, value, desc, color = "text-primary" }) {
  const display = value == null ? "—"
    : typeof value === "number" && value <= 1 ? `${(value * 100).toFixed(1)}%`
    : typeof value === "number" ? value.toLocaleString()
    : String(value);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-serif text-3xl font-bold leading-none mb-1 ${color}`}>{display}</p>
      {desc && <p className="text-xs text-slate-400">{desc}</p>}
    </div>
  );
}

export default function ModelPerformancePage() {
  const { token } = useAuth();
  const { data: perf, loading, error, refetch: fetchPerf } = useApi(
    () => api.get("/admin/model/performance", { token }),
    [token],
  );
  const { on } = useRealtime();
  const [retrained,  setRetrained]  = useState("");

  useEffect(() => {
    const unsub = on("retrain_complete", () => fetchPerf());
    return () => unsub();
  }, [on, fetchPerf]);

  const { mutate: doRetrain, loading: retraining } = useMutation(
    () => api.post("/admin/model/retrain", {}, { token }),
  );

  const triggerRetrain = async () => {
    setRetrained("");
    try {
      const res = await doRetrain();
      setRetrained(res.message || "Retrain job queued successfully.");
      fetchPerf();
    } catch {}
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Model Performance</h1>
          <p className="text-lg text-slate-500">XGBoost risk prediction model — accuracy metrics and retraining</p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.96 }} onClick={fetchPerf}
            className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all">
            <RefreshCw size={13} /> Refresh
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={triggerRetrain} disabled={retraining}
            className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 h-10 rounded-xl disabled:opacity-50 hover:bg-primary/90 transition-all">
            {retraining ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
            {retraining ? "Retraining..." : "Retrain Model"}
          </motion.button>
        </div>
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {error && (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
        {retrained && (
          <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
            <CheckCircle size={14} /> {retrained}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Model info banner */}
      <div className="flex items-start gap-4 bg-slate-50 border border-slate-200 rounded-xl p-5">
        <div className="w-10 h-10 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Info size={18} className="text-primary" />
        </div>
        <div>
          <p className="font-semibold text-slate-900 text-sm mb-1">
            XGBoost Gradient Boosting Classifier
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold ml-2">
              Pilot Phase — Synthetic Data
            </span>
          </p>
          <p className="text-slate-500 text-sm">
            The model is trained on historical engagement data including attendance, quiz scores,
            assignment submissions, and session activity. Retraining uses all available labelled records
            and typically improves accuracy when new semester data is available.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : perf ? (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Accuracy"   value={perf.accuracy}   desc="Overall correct predictions" color="text-primary" />
            <MetricCard label="Precision"  value={perf.precision}  desc="High risk precision"          color="text-blue-600" />
            <MetricCard label="Recall"     value={perf.recall}     desc="High risk recall"             color="text-amber-600" />
            <MetricCard label="F1 Score"   value={perf.f1_score}   desc="Harmonic mean"                color="text-emerald-600" />
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard label="Training Records" value={perf.training_records} desc="Rows used in last fit" color="text-slate-700" />
            <MetricCard label="Last Trained"
              value={perf.last_trained ? new Date(perf.last_trained).toLocaleDateString("en-GB") : null}
              desc="Date of last retrain" color="text-slate-700" />
            <MetricCard label="Model Version" value={perf.model_version ?? "v1"} desc="Current deployed version" color="text-slate-700" />
          </div>

          {/* Synthetic data explanatory banner */}
          {(perf?.accuracy >= 0.99 || perf?.precision >= 0.99) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-2">
              <strong>Why are metrics showing near-perfect scores?</strong>
              <p className="mt-1">
                The model is currently validated on synthetic training data designed with clear class separation
                to verify the pipeline works correctly. Once real semester results are uploaded and the model is
                retrained on actual student data, metrics will reflect genuine predictive accuracy (typically
                80–92% for education datasets). The Retrain button will become active after sufficient results exist.
              </p>
            </div>
          )}

          {/* Feature importance table */}
          {perf.feature_importance && Object.keys(perf.feature_importance).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="font-serif text-xl font-bold text-slate-900 mb-5">Feature Importance</h2>
              <div className="space-y-3">
                {Object.entries(perf.feature_importance)
                  .sort(([, a], [, b]) => b - a)
                  .map(([feature, importance]) => {
                    const pct = Math.round(importance * 100);
                    return (
                      <div key={feature}>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="font-medium text-slate-700 capitalize">{feature.replace(/_/g, " ")}</span>
                          <span className="text-slate-400 text-xs">{pct}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-primary rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Activity size={28} className="mb-3 opacity-30" />
          <p className="text-sm">No model performance data available</p>
          <p className="text-xs mt-1">Train the model first using the Retrain button</p>
        </div>
      )}
    </div>
  );
}
