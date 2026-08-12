// Derives how long a trainee has spent at each level from their `history`
// array (populated by the promote/demote endpoints) plus `join_date`.
// Trainees always start at Level 0 (see backend create_trainee), so the
// first period is inferred even if `history` is missing or incomplete.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toDateOnly = (value) => (value ? String(value).slice(0, 10) : null);

const daysBetween = (startStr, endStr) => {
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  return Math.max(0, Math.round((end - start) / MS_PER_DAY));
};

// Chronological list of { level, start, end, days } periods.
export function getLevelPeriods(trainee, todayStr = new Date().toISOString().slice(0, 10)) {
  if (!trainee) return [];
  const history = Array.isArray(trainee.history) ? trainee.history : [];

  const joinedEvent = history.find((h) => h.type === "joined");
  const startDate =
    toDateOnly(trainee.join_date) ||
    toDateOnly(joinedEvent?.at) ||
    toDateOnly(trainee.created_at) ||
    todayStr;

  const changes = history
    .filter((h) => h.type === "promotion" || h.type === "demotion")
    .map((h) => ({
      date: toDateOnly(h.effective_date) || toDateOnly(h.at),
      level: h.to,
    }))
    .filter((c) => c.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const marks = [{ date: startDate, level: 0 }, ...changes];

  return marks.map((mark, i) => {
    const start = mark.date;
    const end = i + 1 < marks.length ? marks[i + 1].date : todayStr;
    return { level: mark.level, start, end, days: daysBetween(start, end) };
  });
}

// Total days ever spent at a given level, summed across every stint —
// handles trainees who were promoted away and later demoted back.
export function daysAtLevel(trainee, level, todayStr) {
  return getLevelPeriods(trainee, todayStr)
    .filter((p) => p.level === level)
    .reduce((sum, p) => sum + p.days, 0);
}

// Days in the trainee's current level only (their present, still-open stint).
export function daysAtCurrentLevel(trainee, todayStr = new Date().toISOString().slice(0, 10)) {
  const since = toDateOnly(trainee?.level_since_date);
  if (!since) return 0;
  return daysBetween(since, todayStr);
}
