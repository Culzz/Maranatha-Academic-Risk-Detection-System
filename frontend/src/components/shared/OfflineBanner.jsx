import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, Zap, RefreshCw } from "lucide-react";
import useNetworkStatus from "../../hooks/useNetworkStatus";
import useOfflineQueue from "../../hooks/useOfflineQueue";

export default function OfflineBanner() {
  const { isOnline, isSlow, connectionType } = useNetworkStatus();
  const { queueSize, syncing } = useOfflineQueue();

  const showOffline = !isOnline;
  const showSlow = isOnline && isSlow;
  const showSync = isOnline && syncing;

  return (
    <AnimatePresence>
      {(showOffline || showSlow || showSync) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={`overflow-hidden text-center text-xs font-medium ${
            showOffline
              ? "bg-red-600 text-white"
              : showSync
              ? "bg-blue-600 text-white"
              : "bg-amber-500 text-amber-950"
          }`}
        >
          <div className="flex items-center justify-center gap-2 py-1.5 px-4">
            {showOffline ? (
              <>
                <WifiOff size={14} />
                <span>
                  You are offline — some features may be unavailable
                  {queueSize > 0 && ` (${queueSize} pending)`}
                </span>
              </>
            ) : showSync ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Syncing queued requests...</span>
              </>
            ) : (
              <>
                <Zap size={14} />
                <span>Slow connection detected ({connectionType}) — data may load slower</span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
