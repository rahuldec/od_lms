// Derives how long a trainee has spent at each level from their `history`
// array (populated by the promote/demote endpoints) plus `join_date`.
// Trainees always start at Level 0 (see backend create_trainee), so the
// first period is inferred even if `history` is missing or incomplete.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const toDateOnly = (value) => (value ? String(value).slice(0, 10) : null);

export const daysBetween = (startStr, endStr) => {
  const start = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  return Math.max(0, Math.round((end - start) / MS_PER_DAY));
};

// Chronological list of { level, start, end, days } periods.
//
// The final period always reflects current_level/level_since_date exactly
// as they stand on the trainee row, not whatever the history log implies -
// those two fields are set together by the admin's most recent promote,
// demote, or hand-edit, and that's the final word on where the trainee is
// now. history entries are only used to reconstruct earlier, closed stints
// (anything strictly before level_since_date); a mis-clicked or backdated
// entry in there can no longer contradict the present state, since the
// current period isn't derived from the log at all.
export function getLevelPeriods(trainee, todayStr = new Date().toISOString().slice(0, 10)) {
  if (!trainee) return [];
  const history = Array.isArray(trainee.history) ? trainee.history : [];

  const joinedEvent = history.find((h) => h.type === "joined");
  const startDate =
    toDateOnly(trainee.join_date) ||
    toDateOnly(joinedEvent?.at) ||
    toDateOnly(trainee.created_at) ||
    todayStr;

  const currentLevel = trainee.current_level ?? 0;
  const sinceDate = toDateOnly(trainee.level_since_date) || startDate;

  const changes = history
    .filter((h) => h.type === "promotion" || h.type === "demotion")
    .map((h) => ({
      date: toDateOnly(h.effective_date) || toDateOnly(h.at),
      level: h.to,
    }))
    .filter((c) => c.date && c.date < sinceDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const marks = [{ date: startDate, level: 0 }, ...changes, { date: sinceDate, level: currentLevel }];

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

// Days in the trainee's current level only (their present, still-open
// stint). getLevelPeriods always anchors its last period to
// current_level/level_since_date, so this is just that period's length -
// no history lookup needed, and nothing in the log can throw it off.
export function daysAtCurrentLevel(trainee, todayStr = new Date().toISOString().slice(0, 10)) {
  const periods = getLevelPeriods(trainee, todayStr);
  return periods.length ? periods[periods.length - 1].days : 0;
}
