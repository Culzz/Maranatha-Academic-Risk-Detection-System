import { Calendar, MapPin, Clock, Check } from "lucide-react";

export default function StudyInviteCard({ invite, msgId, senderName, onRsvp }) {
  return (
    <div className="flex justify-center py-2 px-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-b border-amber-100 dark:border-amber-800">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">
            Study Session
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{invite.topic}</p>
          {senderName && <p className="text-[10px] text-slate-400 mt-0.5">by {senderName}</p>}
        </div>
        <div className="px-5 py-3 space-y-2.5">
          <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
            <MapPin size={14} className="text-amber-500 flex-shrink-0" />
            <span>{invite.venue}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
            <Calendar size={14} className="text-amber-500 flex-shrink-0" />
            <span>{invite.scheduled_date || invite.date}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
            <Clock size={14} className="text-amber-500 flex-shrink-0" />
            <span>{invite.scheduled_time || invite.time}</span>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-amber-100 dark:border-amber-800 flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">{invite.rsvp_count || 0} attending</p>
          <button
            onClick={() => onRsvp(msgId)}
            disabled={invite.user_rsvped}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              invite.user_rsvped
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-default"
                : "bg-amber-500 text-white hover:bg-amber-600"
            }`}
          >
            {invite.user_rsvped ? (
              <span className="flex items-center gap-1.5"><Check size={12} /> Attending</span>
            ) : "RSVP"}
          </button>
        </div>
      </div>
    </div>
  );
}
