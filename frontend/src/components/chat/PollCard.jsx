export default function PollCard({ msg, onVote }) {
  const poll = msg.poll_data;
  const totalVotes = (poll.options || []).reduce((s, o) => s + (o.votes || 0), 0);
  const senderName = msg.anonymous_alias || msg.sender_name || "User";

  return (
    <div className="flex justify-center py-2 px-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-b border-slate-100 dark:border-slate-700">
          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-1">Poll</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{poll.question}</p>
          <p className="text-[10px] text-slate-400 mt-1">by {senderName}</p>
        </div>
        <div className="px-5 py-3 space-y-2">
          {(poll.options || []).map((opt, idx) => {
            const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
            return (
              <button key={idx} onClick={() => onVote(msg.id, idx)} className="w-full text-left group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-700 dark:text-slate-300">{opt.text || opt.label}</span>
                  <span className="text-xs font-bold text-slate-500">{pct}%</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{opt.votes || 0} votes</p>
              </button>
            );
          })}
        </div>
        <div className="px-5 py-2 border-t border-slate-100 dark:border-slate-700">
          <p className="text-[10px] text-slate-400">{totalVotes} total votes</p>
        </div>
      </div>
    </div>
  );
}
