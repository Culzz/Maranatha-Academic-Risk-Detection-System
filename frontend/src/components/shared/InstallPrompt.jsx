import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, GraduationCap, X } from "lucide-react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installed, setInstalled] = useState(false);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosDismissed = localStorage.getItem("pwa_install_dismissed");
  const [showIosHint, setShowIosHint] = useState(isIOS && !isStandalone && !iosDismissed);

  useEffect(() => {
    // Don't show if already dismissed or installed
    if (localStorage.getItem("pwa_install_dismissed")) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show after a short delay so it doesn't interrupt initial load
      setTimeout(() => setShowBanner(true), 3000);
    };

    const installedHandler = () => {
      setInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
    }
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("pwa_install_dismissed", "1");
  };

  return (
    <AnimatePresence>
      {showIosHint && (
        <motion.div
          key="ios-hint"
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          className="fixed bottom-4 left-4 right-4 z-[9999] bg-primary text-white
                     rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3"
        >
          <GraduationCap size={22} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Install on iPhone / iPad</p>
            <p className="text-xs opacity-75 mt-0.5">
              Tap the <strong>Share</strong> button then <strong>"Add to Home Screen"</strong>
            </p>
          </div>
          <button
            onClick={() => {
              localStorage.setItem("pwa_install_dismissed", "1");
              setShowIosHint(false);
            }}
            className="flex-shrink-0 text-white/70 hover:text-white"
            aria-label="Dismiss install prompt"
          >
            <X size={18} />
          </button>
        </motion.div>
      )}
      {showBanner && !installed && (
        <motion.div
          key="android-prompt"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-[9999]"
        >
          <div className="bg-primary rounded-2xl shadow-2xl border border-white/10 p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0">
                <Download size={22} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold text-sm mb-1">Install Maranatha Risk</h3>
                <p className="text-slate-300 text-xs leading-relaxed mb-3">
                  Add to your home screen for quick access, offline support, and a native app experience.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleInstall}
                    className="px-4 py-2 bg-accent text-primary text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Install App
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-3 py-2 text-slate-400 text-xs hover:text-white transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
