/**
 * useRealTimeClock — Hook that returns a live date/time string.
 *
 * Updates every minute. Returns { dateStr, timeStr, dayStr }.
 *
 * Example output:
 *   dateStr: "Sunday, 8 March 2026"
 *   timeStr: "2:34 PM"
 *   dayStr:  "Sun"
 */
import { useState, useEffect } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatNow() {
  const now = new Date();
  const day = DAYS[now.getDay()];
  const month = MONTHS[now.getMonth()];
  const date = now.getDate();
  const year = now.getFullYear();

  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return {
    dateStr: `${day}, ${date} ${month} ${year}`,
    timeStr: `${hours}:${minutes} ${ampm}`,
    dayStr: day.slice(0, 3),
  };
}

export default function useRealTimeClock() {
  const [clock, setClock] = useState(formatNow);

  useEffect(() => {
    const id = setInterval(() => setClock(formatNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  return clock;
}
