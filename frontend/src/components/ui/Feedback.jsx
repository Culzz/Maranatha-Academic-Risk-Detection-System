import { Loader2, ArrowLeft, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function Spinner({ size = 18, className = "" }) {
  return <Loader2 size={size} className={`animate-spin text-accent/50 ${className}`} />;
}

export function LoadingScreen({ message = "Loading..." }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-24">
      <Spinner size={22} />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-6">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
          {icon}
        </div>
      )}
      <div>
        <p className="text-base font-semibold text-primary">{title}</p>
        {message && (
          <p className="text-sm text-slate-400 mt-1.5 max-w-xs leading-relaxed">{message}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * PageHeader — 28px serif title, slate subtitle, optional back + action.
 */
export function PageHeader({ title, subtitle, action, back }) {
  return (
    <div className="flex items-start justify-between gap-6 flex-wrap mb-8">
      <div>
        {back && (
          <button
            onClick={back}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-primary mb-2 transition-colors"
          >
            <ArrowLeft size={13} /> Back
          </button>
        )}
        <h1 className="font-serif font-semibold text-primary"
            style={{ fontSize: 28, letterSpacing: "-0.028em", lineHeight: 1.2 }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-xl">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0 flex items-center gap-2 pt-1">{action}</div>
      )}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{   opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="flex items-center justify-between gap-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-5"
        >
          <span>{message}</span>
          {onDismiss && (
            <button onClick={onDismiss} className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors">
              <X size={14} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SuccessBanner({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{   opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 mb-5"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
