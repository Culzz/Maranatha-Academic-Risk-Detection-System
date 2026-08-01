/**
 * ProfilePage — shared account management page for all three roles.
 * Tabs: Profile Info | Security | Preferences
 * Supports ?tab= query param for deep linking from UserDropdown.
 */
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  User, Lock, Settings, Camera, Eye, EyeOff, Save, Check, AlertCircle,
  Mail, Phone, FileText,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useLayout } from "../../context/LayoutContext";
import { profileApi } from "../../services/api";
import CustomDropdown from "../../components/ui/CustomDropdown";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import MfaSetupSection from "../../components/shared/MfaSetupSection";
import UploadConfirmModal from "../../components/shared/UploadConfirmModal";
import useUploadConfirm from "../../hooks/useUploadConfirm";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Lock },
  { id: "preferences", label: "Preferences", icon: Settings },
];

function StrengthBar({ password }) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const colors = ["bg-red-500", "bg-amber-500", "bg-amber-400", "bg-emerald-400", "bg-emerald-500"];
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return (
    <div className="mt-1.5">
      <div className="flex gap-1 h-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`flex-1 rounded-full transition-colors ${i < score ? colors[score] : "bg-slate-200"}`} />
        ))}
      </div>
      {score > 0 && <p className="text-xs text-slate-400 mt-1">{labels[score]}</p>}
    </div>
  );
}

export default function ProfilePage() {
  const { user, token, updateUser } = useAuth();
  const { theme: currentTheme, toggleTheme } = useTheme();
  const { layout: currentLayout, setLayout } = useLayout();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    return TABS.some((x) => x.id === t) ? t : "profile";
  });
  const [profile, setProfile] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Profile form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");

  // Password form
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const fileRef = useRef();
  const uc = useUploadConfirm();

  useEffect(() => {
    (async () => {
      try {
        const [profileData, prefsData] = await Promise.all([
          profileApi.getProfile(token),
          profileApi.getPreferences(token),
        ]);
        setProfile(profileData);
        setPrefs(prefsData);
        setFullName(profileData.full_name || "");
        setEmail(profileData.email || "");
        setPhone(profileData.phone || "");
        setBio(profileData.bio || "");
        if (prefsData?.theme && prefsData.theme !== currentTheme) {
          toggleTheme();
        }
        if (prefsData?.dashboard_layout && prefsData.dashboard_layout !== currentLayout) {
          setLayout(prefsData.dashboard_layout);
        }
      } catch (e) {
        setMessage({ type: "error", text: e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const flash = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 4000);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await profileApi.updateProfile({ full_name: fullName, email, phone, bio }, token);
      updateUser({ full_name: fullName });
      flash("success", "Profile updated.");
    } catch (e) {
      flash("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) return flash("error", "Passwords don't match.");
    if (newPw.length < 8) return flash("error", "Password must be at least 8 characters.");
    if (!/[0-9]/.test(newPw)) return flash("error", "Password must contain at least one number.");
    setSaving(true);
    try {
      await profileApi.changePassword({ current_password: currentPw, new_password: newPw }, token);
      flash("success", "Password updated successfully.");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (e) {
      flash("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = (e) => {
    uc.selectFile(e);
  };

  const handleConfirmPhoto = () => {
    uc.confirmUpload(async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await profileApi.uploadPicture(fd, token);
      setProfile((p) => ({ ...p, profile_picture_url: res.profile_picture_url }));
      updateUser({ profile_picture_url: res.profile_picture_url });
      flash("success", "Photo updated.");
    }).catch((err) => flash("error", err.message));
  };

  const savePref = async (key, value) => {
    try {
      const updated = await profileApi.updatePreferences({ [key]: value }, token);
      setPrefs(updated);
    } catch {}
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const userInitials = (profile?.full_name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const roleLabel = profile?.role === "lecturer" ? "Lecturer" : profile?.role === "admin" ? "Administrator" : "Student";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Premium Profile Header Card */}
      <div className="bg-primary rounded-2xl p-6 sm:p-8 shadow-premium-lg">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {profile?.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt="Avatar"
                className="w-24 h-24 rounded-2xl object-cover border-2 border-white/20"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-2xl font-bold text-gold-400 border border-white/10">
                {userInitials}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-2 -right-2 w-8 h-8 bg-accent rounded-xl flex items-center justify-center shadow-lg hover:bg-accent-light transition-colors"
            >
              <Camera size={14} className="text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </div>

          {/* User info */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold text-white mb-1">{profile?.full_name || "User"}</h1>
            <p className="text-sm text-slate-300 mb-3">{profile?.email}</p>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              <Badge variant="pill" label={roleLabel} color="gold" dot={false} size="xs" />
              {profile?.department_name && (
                <Badge variant="pill" label={profile.department_name} color="navy" dot={false} size="xs" />
              )}
              {profile?.matric_number && (
                <span className="text-xs text-slate-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                  {profile.matric_number}
                </span>
              )}
              {profile?.staff_id && (
                <span className="text-xs text-slate-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                  {profile.staff_id}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status message */}
      {message.text && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className={`px-4 py-3 rounded-2xl text-sm flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {message.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </motion.div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border border-slate-100 bg-slate-50/60 rounded-2xl p-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === id
                ? "bg-white text-primary shadow-premium-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── Profile Tab ──────────────────────────────────── */}
      {tab === "profile" && (
        <Card premium>
          <div className="space-y-5">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="ds-label">Full Name</label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-accent/15 focus:border-accent/40 outline-none bg-white" />
                </div>
              </div>
              <div>
                <label className="ds-label">Email</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-accent/15 focus:border-accent/40 outline-none bg-white" />
                </div>
              </div>
              <div>
                <label className="ds-label">Phone Number</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-accent/15 focus:border-accent/40 outline-none bg-white" />
                </div>
              </div>
            </div>

            <div>
              <label className="ds-label">Bio <span className="text-slate-400 normal-case font-normal tracking-normal">({bio.length}/200)</span></label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 200))} rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 outline-none bg-white" />
            </div>

            {/* GPS location sharing preference */}
            {user?.role === "student" && (
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">GPS Location Sharing</p>
                  <p className="text-xs text-slate-500">Allow location verification during attendance check-ins</p>
                </div>
                <button
                  role="switch"
                  aria-checked={!!profile?.gps_opt_in}
                  aria-label={`GPS sharing: ${profile?.gps_opt_in ? "enabled" : "disabled"}`}
                  onClick={async () => {
                    try {
                      await profileApi.updateProfile({ gps_opt_in: !profile?.gps_opt_in }, token);
                      setProfile(prev => ({ ...prev, gps_opt_in: !prev?.gps_opt_in }));
                      flash("success", `GPS sharing ${!profile?.gps_opt_in ? "enabled" : "disabled"}.`);
                    } catch (e) { flash("error", e.message); }
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors ${profile?.gps_opt_in ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${profile?.gps_opt_in ? "translate-x-5" : ""}`} />
                </button>
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-light disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
              Save Changes
            </motion.button>
          </div>
        </Card>
      )}

      {/* ── Security Tab ─────────────────────────────────── */}
      {tab === "security" && (
        <div className="space-y-6">
          <Card premium>
            <div className="space-y-5">

              <div>
                <label className="ds-label">Current Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm pr-10 focus:ring-2 focus:ring-accent/15 focus:border-accent/40 outline-none bg-white" />
                  <button onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="ds-label">New Password</label>
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-accent/15 focus:border-accent/40 outline-none bg-white" />
                  {newPw && <StrengthBar password={newPw} />}
                </div>
                <div>
                  <label className="ds-label">Confirm New Password</label>
                  <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-accent/15 focus:border-accent/40 outline-none bg-white" />
                  {confirmPw && newPw !== confirmPw && (
                    <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
                  )}
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleChangePassword}
                disabled={saving || !currentPw || !newPw || newPw !== confirmPw}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-light disabled:opacity-50 transition-colors shadow-sm"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Lock size={16} />}
                Update Password
              </motion.button>
            </div>
          </Card>

          <Card premium>
            <div className="space-y-3">
              <div className="text-sm text-slate-500 space-y-2">
                {profile?.last_password_changed && (
                  <p>Last password change: <span className="text-slate-700 font-medium">{new Date(profile.last_password_changed).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span></p>
                )}
                {profile?.last_login && (
                  <p>Last login: <span className="text-slate-700 font-medium">{new Date(profile.last_login).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></p>
                )}
                {profile?.created_at && (
                  <p>Account created: <span className="text-slate-700 font-medium">{new Date(profile.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span></p>
                )}
              </div>
            </div>
          </Card>

          <MfaSetupSection />
        </div>
      )}

      {/* ── Preferences Tab ──────────────────────────────── */}
      {tab === "preferences" && prefs && (
        <div className="space-y-6">
          <Card premium>
            <div>
              <h3 className="font-semibold text-slate-900 mt-4 mb-3">Theme</h3>
              <div className="flex gap-3">
                {["light", "dark"].map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      savePref("theme", t);
                      if (currentTheme !== t) toggleTheme();
                    }}
                    className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium capitalize transition-all ${
                      prefs.theme === t
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card premium>
            <div className="space-y-4">
              <div className="mt-3 space-y-3">
                {[
                  { key: "notify_risk_changes", label: "Risk Level Changes" },
                  { key: "notify_interventions", label: "Interventions & Nudges" },
                  { key: "notify_assignments", label: "Assignment Deadlines" },
                  { key: "notify_messages", label: "Messages" },
                  { key: "push_notifications", label: "Sound Alerts" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{label}</span>
                    <button
                      role="switch"
                      aria-checked={!!prefs[key]}
                      aria-label={`${label}: ${prefs[key] ? "enabled" : "disabled"}`}
                      onClick={() => savePref(key, !prefs[key])}
                      className={`w-11 h-6 rounded-full transition-colors relative ${prefs[key] ? "bg-accent" : "bg-slate-300"}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${prefs[key] ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </label>
                ))}
              </div>
            </div>
          </Card>

          <Card premium>
            <div>
              <h3 className="font-semibold text-slate-900 mt-4 mb-3">Dashboard Layout</h3>
              <div className="flex gap-3">
                {["default", "compact", "detailed"].map((l) => (
                  <button
                    key={l}
                    onClick={() => { savePref("dashboard_layout", l); setLayout(l); }}
                    className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium capitalize transition-all ${
                      currentLayout === l
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card premium>
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Show Risk Percentage</p>
                  <p className="text-xs text-slate-400 mt-0.5">When off, only shows High/Medium/Low label</p>
                </div>
                <button
                  role="switch"
                  aria-checked={!!prefs.show_risk_percentage}
                  aria-label={`Show Risk Percentage: ${prefs.show_risk_percentage ? "enabled" : "disabled"}`}
                  onClick={() => savePref("show_risk_percentage", !prefs.show_risk_percentage)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${prefs.show_risk_percentage ? "bg-accent" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${prefs.show_risk_percentage ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </label>
            </div>
          </Card>

          <Card premium>
            <CustomDropdown
              label="Weekly Digest Day"
              value={prefs.weekly_digest_day}
              onChange={(val) => savePref("weekly_digest_day", val)}
              options={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => ({
                value: d,
                label: d,
              }))}
            />
          </Card>

          {/* AI Tone */}
          <Card premium>
            <h3 className="text-sm font-bold text-slate-900 mb-3">AI Communication Tone</h3>
            <p className="text-xs text-slate-500 mb-3">Choose how the AI tutor and notifications speak to you.</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "encouraging", label: "Encouraging", desc: "Warm and supportive" },
                { value: "neutral", label: "Neutral", desc: "Factual and professional" },
                { value: "minimal", label: "Minimal", desc: "Brief and direct" },
              ].map(t => (
                <button
                  key={t.value}
                  onClick={() => savePref("tone_preference", t.value)}
                  className={[
                    "p-3 rounded-xl border text-left transition-all",
                    (prefs.tone_preference || "encouraging") === t.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-slate-200 hover:border-slate-300",
                  ].join(" ")}
                >
                  <p className="text-xs font-semibold text-slate-900">{t.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      <UploadConfirmModal file={uc.pendingFile} onConfirm={handleConfirmPhoto} onCancel={uc.cancelUpload}
        uploading={uc.uploading} progress={uc.progress} title="Update Profile Photo" />
    </div>
  );
}
