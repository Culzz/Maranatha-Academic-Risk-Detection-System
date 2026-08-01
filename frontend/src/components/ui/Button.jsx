import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary: "bg-primary    text-white  border-transparent hover:bg-primary-light  shadow-sm hover:shadow",
  ghost:   "bg-transparent text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300",
  danger:  "bg-risk-high   text-white  border-transparent hover:bg-red-700       shadow-sm",
  gold:    "bg-accent      text-white  border-transparent hover:bg-accent-light  shadow-sm hover:shadow",
  outline: "bg-white       text-primary border-slate-200  hover:bg-slate-50 hover:border-slate-300",
  pill:    "bg-transparent text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300 !rounded-full",
  link:    "bg-transparent text-accent  border-transparent hover:text-accent-dark p-0 h-auto shadow-none hover:shadow-none",
};

const SIZES = {
  xs: "text-xs  px-3    py-1.5  rounded-lg  gap-1.5 h-7",
  sm: "text-sm  px-3.5  py-2    rounded-xl  gap-2   h-9",
  md: "text-sm  px-4    py-2.5  rounded-xl  gap-2   h-10",
  lg: "text-base px-6   py-3    rounded-xl  gap-2.5 h-12",
};

const ICON_SIZES = {
  xs: "w-7  h-7  rounded-lg",
  sm: "w-9  h-9  rounded-xl",
  md: "w-10 h-10 rounded-xl",
  lg: "w-12 h-12 rounded-xl",
};

export default function Button({
  children,
  variant   = "primary",
  size      = "sm",
  icon,
  iconRight,
  loading   = false,
  disabled  = false,
  className = "",
  onClick,
  type      = "button",
  fullWidth = false,
}) {
  const isIconOnly = !children && (icon || loading);

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      transition={{ duration: 0.12 }}
      className={[
        "inline-flex items-center justify-center font-semibold border",
        "transition-all duration-150 cursor-pointer",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant] || VARIANTS.primary,
        isIconOnly ? ICON_SIZES[size] || ICON_SIZES.sm : SIZES[size] || SIZES.sm,
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
    >
      {loading
        ? <Loader2 size={13} className="animate-spin flex-shrink-0" />
        : icon && <span className="flex-shrink-0">{icon}</span>
      }
      {children && <span>{children}</span>}
      {!loading && iconRight && <span className="flex-shrink-0">{iconRight}</span>}
    </motion.button>
  );
}
