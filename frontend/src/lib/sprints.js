// Groups trainee<->sprint assignment rows, mirroring lib/projects.js.

/** [{trainee_id, sprint_name, sprint_type, handling_mode, bugs_percent}] -> { [traineeId]: [{sprint_name, sprint_type, handling_mode, bugs_percent}, ...] } */
export const groupSprintAssignmentsByTrainee = (assignments) => {
  const map = {};
  (assignments || []).forEach((a) => {
    if (!a?.trainee_id || !a?.sprint_name) return;
    if (!map[a.trainee_id]) map[a.trainee_id] = [];
    map[a.trainee_id].push({
      sprint_name: a.sprint_name,
      sprint_type: a.sprint_type === "major" ? "major" : "minor",
      handling_mode: a.handling_mode || "solo",
      bugs_percent: a.bugs_percent || 0,
    });
  });
  Object.values(map).forEach((list) =>
    list.sort((a, b) => a.sprint_name.localeCompare(b.sprint_name))
  );
  return map;
};
