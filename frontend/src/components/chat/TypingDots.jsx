import { motion } from "framer-motion";

export default function TypingDots({ users }) {
  if (!users || users.length === 0) return null;
  const names = users.map((u) => u.name || u).join(", ");
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="px-4 py-1.5 flex items-center gap-2"
    >
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {names} {users.length === 1 ? "is" : "are"} typing
      </span>
      <span className="flex gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
      </span>
    </motion.div>
  );
}
