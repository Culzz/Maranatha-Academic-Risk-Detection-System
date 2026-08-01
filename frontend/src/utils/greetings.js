/**
 * greetings.js — Time-of-day greetings with randomisation.
 *
 * Returns a greeting string based on the current hour.
 * Each category has multiple variants for a natural feel.
 */

const MORNING = [
  "Good morning",
  "Rise and shine",
  "Morning",
  "Top of the morning to you",
];

const AFTERNOON = [
  "Good afternoon",
  "Hope your afternoon is going well",
  "Afternoon",
];

const EVENING = [
  "Good evening",
  "Hope you had a great day",
  "Evening",
];

const FIRST_LOGIN = [
  "Welcome aboard",
  "Great to have you here",
  "Welcome to Maranatha Risk System",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get a time-of-day greeting.
 * @param {string} name — User's first name or full name.
 * @param {boolean} isFirstLogin — True if this is the user's first login.
 * @returns {string} Greeting string.
 */
export function getGreeting(name, isFirstLogin = false) {
  if (isFirstLogin) {
    return `${pick(FIRST_LOGIN)}, ${name}!`;
  }

  const hour = new Date().getHours();
  let greeting;

  if (hour < 12) {
    greeting = pick(MORNING);
  } else if (hour < 17) {
    greeting = pick(AFTERNOON);
  } else {
    greeting = pick(EVENING);
  }

  return `${greeting}, ${name}!`;
}

/**
 * Get the first name from a full name string, skipping title prefixes.
 * e.g. "Dr. Jane Smith" → "Jane", "Prof. Ade Uche" → "Ade"
 * @param {string} fullName
 * @returns {string}
 */
const TITLE_PREFIXES = [
  "dr.", "dr", "prof.", "prof", "mr.", "mr", "mrs.", "mrs",
  "ms.", "ms", "engr.", "engr", "rev.", "rev", "pastor",
  "chief", "sir", "dame", "barr.", "barr", "arc.", "arc",
];

export function firstName(fullName) {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    if (!TITLE_PREFIXES.includes(parts[i].toLowerCase())) {
      return parts[i];
    }
  }
  return parts[parts.length - 1];
}

/**
 * Holiday keyword → greeting prefix map.
 * Matched against event_label from the academic calendar.
 */
const HOLIDAY_GREETINGS = {
  christmas:  ["Merry Christmas", "Happy Christmas Break", "Enjoy the Christmas season"],
  easter:     ["Happy Easter", "Have a blessed Easter", "Enjoy the Easter break"],
  "new year": ["Happy New Year", "Wishing you a great New Year"],
  recess:     ["Enjoy the recess", "Have a restful break"],
  vacation:   ["Enjoy your vacation", "Have a refreshing break"],
  break:      ["Enjoy the break", "Have a restful break period"],
  holiday:    ["Happy holidays", "Enjoy the holiday"],
};

/**
 * Get a holiday-aware greeting if applicable.
 * @param {string} name — User's first name.
 * @param {object|null} holidayInfo — current_holiday from week-info endpoint.
 * @returns {string}
 */
export function getHolidayGreeting(name, holidayInfo) {
  if (holidayInfo && holidayInfo.event_label) {
    const label = holidayInfo.event_label.toLowerCase();
    for (const [keyword, greetings] of Object.entries(HOLIDAY_GREETINGS)) {
      if (label.includes(keyword)) {
        return `${pick(greetings)}, ${name}!`;
      }
    }
    // Fallback for unrecognized holiday/break labels
    return `Enjoy the ${holidayInfo.event_label}, ${name}!`;
  }
  // No holiday — fall back to time-of-day
  return getGreeting(name);
}
