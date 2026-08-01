import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Clock, Smile, Hand, Heart, Utensils, Lightbulb, Flag } from "lucide-react";

const CATEGORIES = [
  {
    id: "recent", icon: Clock, label: "Recent",
    emojis: [] // populated from localStorage
  },
  {
    id: "smileys", icon: Smile, label: "Smileys",
    emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🫡","🤐","🤨","😐","😑","😶","🫥","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥴","😵","🤯","🥱","😤","😭","😢","😥","😰","😨","😱","🥶","🥵","😳","🤬","😡","😠"]
  },
  {
    id: "gestures", icon: Hand, label: "Gestures",
    emojis: ["👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","💪","🦾"]
  },
  {
    id: "hearts", icon: Heart, label: "Hearts",
    emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟","♥️","🫀"]
  },
  {
    id: "objects", icon: Lightbulb, label: "Objects",
    emojis: ["📚","📖","📝","✏️","📌","📎","📋","📂","🗂️","💻","🖥️","⌨️","🖱️","💡","🔔","🎯","🏆","🎓","⭐","🌟","✨","🔥","💯","✅","❌","⚡","🚀","🎉","🎊","🎁","📊","📈","📉","🧮","⏰","⏳","📱","🔑","🔒"]
  },
  {
    id: "symbols", icon: Flag, label: "Symbols",
    emojis: ["➕","➖","✖️","➗","♾️","‼️","⁉️","❓","❗","〰️","💲","⚕️","♻️","⚜️","🔱","📛","🔰","⭕","✅","☑️","✔️","❌","❎","➰","➿","〽️","✳️","✴️","❇️","©️","®️","™️","#️⃣","*️⃣","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"]
  },
];

const RECENT_KEY = "maranatha_recent_emojis";

export default function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState("smileys");
  const [search, setSearch] = useState("");
  const [recentEmojis, setRecentEmojis] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
    catch { return []; }
  });
  const panelRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleSelect = (emoji) => {
    onSelect(emoji);
    const updated = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 24);
    setRecentEmojis(updated);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  };

  const categories = CATEGORIES.map(c =>
    c.id === "recent" ? { ...c, emojis: recentEmojis } : c
  );

  const filtered = search.trim()
    ? categories.flatMap(c => c.emojis).filter(e => e.includes(search))
    : null;

  const currentCat = categories.find(c => c.id === activeCategory);

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="w-[320px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden"
    >
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search emoji..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 border-0 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-0.5 px-2 pb-1.5 border-b border-slate-100 dark:border-slate-700">
        {categories.map(cat => {
          if (cat.id === "recent" && cat.emojis.length === 0) return null;
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setSearch(""); }}
              className={`p-1.5 rounded-lg transition-colors ${
                activeCategory === cat.id && !search
                  ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                  : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
              title={cat.label}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>

      {/* Emoji grid */}
      <div className="h-[200px] overflow-y-auto px-2 py-2 scrollbar-thin">
        {search && filtered?.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">No emoji found</p>
        )}
        <div className="grid grid-cols-8 gap-0.5">
          {(filtered || currentCat?.emojis || []).map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              onClick={() => handleSelect(emoji)}
              className="w-9 h-9 flex items-center justify-center text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
