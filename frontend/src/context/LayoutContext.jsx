import { createContext, useContext, useState, useEffect, useCallback } from "react";

const LayoutContext = createContext({ layout: "default", setLayout: () => {} });

export function LayoutProvider({ children }) {
  const [layout, setLayoutState] = useState(() => {
    try { return localStorage.getItem("maranatha_layout") || "default"; }
    catch { return "default"; }
  });

  const setLayout = useCallback((l) => {
    setLayoutState(l);
    localStorage.setItem("maranatha_layout", l);
  }, []);

  return (
    <LayoutContext.Provider value={{ layout, setLayout }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}
