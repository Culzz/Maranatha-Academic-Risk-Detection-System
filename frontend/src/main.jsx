import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode><App /></StrictMode>
);

// Web Vitals — logs in dev, can POST to /api/vitals in production
import { onCLS, onINP, onLCP, onFCP, onTTFB } from "web-vitals";
function reportVital({ name, value, rating }) {
  if (import.meta.env.DEV) {
    console.log(`[Web Vital] ${name}: ${Math.round(value)}ms (${rating})`);
  } else if (rating === "poor") {
    console.warn(`[Web Vital POOR] ${name}: ${Math.round(value)}ms`);
  }
}
onCLS(reportVital);
onINP(reportVital);
onLCP(reportVital);
onFCP(reportVital);
onTTFB(reportVital);