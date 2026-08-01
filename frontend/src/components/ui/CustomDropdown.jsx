/**
 * CustomDropdown — searchable select with Navy/Gold design.
 * Matches Input height (h-10) and focus ring exactly.
 * Full keyboard navigation and ARIA support.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Search } from "lucide-react";

export default function CustomDropdown({
  value,
  onChange,
  options       = [],
  label,
  placeholder   = "Select an option",
  disabled      = false,
  searchable    = false,
  required      = false,
  error,
  hint,
  className     = "",
}) {
  const [isOpen,       setIsOpen]       = useState(false);
  const [query,        setQuery]        = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref        = useRef(null);
  const searchRef  = useRef(null);
  const optionRefs = useRef([]);
  const listboxId  = useRef(`dropdown-listbox-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
        setQuery("");
        setFocusedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (isOpen && searchable) setTimeout(() => searchRef.current?.focus(), 60);
    if (!isOpen) {
      setQuery("");
      setFocusedIndex(-1);
    }
  }, [isOpen, searchable]);

  // Scroll focused option into view
  useEffect(() => {
    if (focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex].scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const selectedOption = options.find(opt => opt.value === value);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const toggle = () => !disabled && setIsOpen(v => !v);
  const close  = () => { setIsOpen(false); setQuery(""); setFocusedIndex(-1); };
  const select = (val) => { onChange(val); close(); };

  const handleKeyDown = useCallback((e) => {
    if (disabled) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(0);
        } else {
          setFocusedIndex(prev => Math.min(prev + 1, filtered.length - 1));
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        if (isOpen) {
          setFocusedIndex(prev => Math.max(prev - 1, 0));
        }
        break;

      case "Enter":
      case " ":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(0);
        } else if (focusedIndex >= 0 && focusedIndex < filtered.length) {
          select(filtered[focusedIndex].value);
        }
        break;

      case "Escape":
        e.preventDefault();
        close();
        break;

      case "Home":
        if (isOpen) {
          e.preventDefault();
          setFocusedIndex(0);
        }
        break;

      case "End":
        if (isOpen) {
          e.preventDefault();
          setFocusedIndex(filtered.length - 1);
        }
        break;

      default:
        break;
    }
  }, [disabled, isOpen, filtered, focusedIndex]);

  return (
    <div className={`w-full ${className}`} ref={ref}>
      {label && (
        <label className="ds-label">
          {label}{required && <span className="text-risk-high ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {/* Trigger */}
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          className={[
            "w-full h-10 bg-white border rounded-xl text-sm text-primary",
            "pl-3.5 pr-9 flex items-center outline-none transition-all",
            "hover:border-slate-300",
            isOpen || error
              ? isOpen
                ? "ring-2 ring-accent/15 border-accent/40"
                : "border-red-300"
              : "border-slate-200",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50",
          ].join(" ")}
        >
          <span className={`flex-1 text-left truncate ${!selectedOption ? "text-slate-400" : ""}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown
            size={14}
            className={`absolute right-3 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Panel */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{   opacity: 0, y: -6  }}
              transition={{ duration: 0.13, ease: "easeOut" }}
              className="absolute z-50 w-full top-full left-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
              style={{ maxHeight: 260 }}
            >
              {/* Search */}
              {searchable && (
                <div className="px-4 pt-3 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Search size={12} className="text-slate-400 flex-shrink-0" />
                    <input
                      ref={searchRef}
                      name="dropdown-search"
                      aria-label="Search options"
                      value={query}
                      onChange={e => { setQuery(e.target.value); setFocusedIndex(0); }}
                      onKeyDown={handleKeyDown}
                      placeholder="Search..."
                      className="flex-1 bg-transparent text-sm outline-none text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}

              {/* Options */}
              <div
                id={listboxId}
                role="listbox"
                aria-label={label || placeholder}
                className="overflow-y-auto"
                style={{ maxHeight: searchable ? 196 : 244 }}
              >
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-1.5">
                    <p className="text-xs text-slate-400">No options found</p>
                  </div>
                ) : filtered.map((option, index) => {
                  const active = option.value === value;
                  const focused = index === focusedIndex;
                  return (
                    <button
                      key={option.value}
                      ref={el => { optionRefs.current[index] = el; }}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => select(option.value)}
                      onMouseEnter={() => setFocusedIndex(index)}
                      className={[
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-all",
                        active
                          ? "bg-accent/8 text-accent font-semibold border-r-2 border-accent"
                          : focused
                            ? "bg-slate-100 text-primary"
                            : "text-slate-700 hover:bg-slate-50 hover:text-primary",
                      ].join(" ")}
                    >
                      {active
                        ? <Check size={13} className="text-accent flex-shrink-0" />
                        : <span className="w-3.5 flex-shrink-0" />
                      }
                      <span className="truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && <p className="text-xs text-risk-high mt-1.5">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400 mt-1.5">{hint}</p>}
    </div>
  );
}
