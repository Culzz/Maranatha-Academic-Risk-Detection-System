import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, useId } from "react";

const WIDTHS = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

const FOCUSABLE = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export default function Modal({ open, onClose, title, subtitle, children, size = "md", footer }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const triggerRef = useRef(null);
  const headingId = useId();

  // Save trigger + focus close button on open; restore trigger on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      setTimeout(() => closeRef.current?.focus(), 30);
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  // Keyboard: Escape to close + Tab/Shift-Tab focus trap
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll(FOCUSABLE));
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className={[
              "relative bg-white rounded-2xl border border-slate-200",
              "shadow-xl w-full flex flex-col",
              "max-h-[90vh]",
              WIDTHS[size],
            ].join(" ")}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{   opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 flex-shrink-0">
              <div>
                {title && (
                  <h2 id={headingId}
                      className="font-serif text-lg font-semibold text-primary leading-snug"
                      style={{ letterSpacing: "-0.018em" }}>
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
                )}
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close dialog"
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-all flex-shrink-0 -mr-1 -mt-0.5"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto px-6 py-6 flex-1 min-h-0">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 flex items-center justify-end gap-3">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
