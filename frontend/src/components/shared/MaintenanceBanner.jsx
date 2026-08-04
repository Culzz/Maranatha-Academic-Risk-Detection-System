/**
 * MaintenanceBanner — Shows a warning banner when maintenance_mode is enabled.
 * Fetches public settings from /api/admin/settings/public (no auth required).
 * Hidden for admin users.
 */
import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { BASE_URL } from "../../services/api";

export default function MaintenanceBanner() {
  const { user } = useAuth();
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    fetch(`${BASE_URL}/admin/settings/public`)
      .then(r => r.json())
      .then(data => {
        if (data.maintenance_mode === "true" || data.maintenance_mode === true) {
          setMaintenance(true);
        }
      })
      .catch(() => {});
  }, []);

  if (!maintenance || user?.role === "admin") return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm font-semibold px-4 py-2.5 flex items-center justify-center gap-2 z-[100] relative">
      <AlertTriangle size={15} className="flex-shrink-0 text-amber-600" />
      System is currently under maintenance. Some features may be temporarily unavailable.
    </div>
  );
}
