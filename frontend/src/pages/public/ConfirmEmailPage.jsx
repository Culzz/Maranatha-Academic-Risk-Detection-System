/**
 * ConfirmEmailPage — Maranatha University
 * Reads a token from the URL query string and confirms the user's email
 * via POST /api/auth/confirm-email. Shows success or error feedback.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, RefreshCw, LogIn } from "lucide-react";
import crest from "../../assets/maranatha-crest.png";

export default function ConfirmEmailPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [status, setStatus] = useState("loading"); // loading | success | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("Invalid confirmation link. No token provided.");
      setStatus("error");
      return;
    }

    let cancelled = false;

    const confirmEmail = async () => {
      try {
        const res = await fetch("/api/auth/confirm-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setErrorMsg(data.detail || "Invalid or expired confirmation link.");
          setStatus("error");
        } else {
          setStatus("success");
        }
      } catch {
        if (!cancelled) {
          setErrorMsg("Could not connect to the server. Please try again later.");
          setStatus("error");
        }
      }
    };

    confirmEmail();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          {/* ── Navy Header Strip ──────────────────────────────── */}
          <div className="bg-primary px-6 py-5 flex items-center gap-3">
            <img
              src={crest}
              alt="Maranatha University"
              className="w-10 h-10 object-contain"
            />
            <h1 className="font-serif text-lg font-semibold text-white">
              Maranatha University Lagos
            </h1>
          </div>

          {/* ── Card Body ──────────────────────────────────────── */}
          <div className="px-8 py-10 flex flex-col items-center text-center">
            {/* Loading State */}
            {status === "loading" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-4"
              >
                <RefreshCw className="w-16 h-16 text-primary animate-spin" />
                <p className="text-slate-600 text-lg font-medium">
                  Confirming your email...
                </p>
              </motion.div>
            )}

            {/* Success State */}
            {status === "success" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-4"
              >
                <CheckCircle className="w-16 h-16 text-emerald-500" />
                <div>
                  <h2 className="font-serif text-2xl font-semibold text-primary mb-2">
                    Email Confirmed!
                  </h2>
                  <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto">
                    Your account has been activated. You can now log in.
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate("/login")}
                  className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold h-12 px-8 rounded-xl transition-all shadow-lg hover:shadow-xl mt-2"
                >
                  <LogIn size={16} />
                  Go to Login
                </motion.button>
              </motion.div>
            )}

            {/* Error State */}
            {status === "error" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-4"
              >
                <XCircle className="w-16 h-16 text-red-500" />
                <div>
                  <h2 className="font-serif text-2xl font-semibold text-primary mb-2">
                    Confirmation Failed
                  </h2>
                  <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto">
                    {errorMsg}
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate("/")}
                  className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold h-12 px-8 rounded-xl transition-all shadow-lg hover:shadow-xl mt-2"
                >
                  Back to Home
                </motion.button>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
