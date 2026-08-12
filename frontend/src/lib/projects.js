// Groups trainee<->project assignment rows, mirroring lib/clients.js's
// groupAssignmentsByTrainee. Kept separate rather than generalizing the two
// since the field name (client_name vs project_name) differs and both are
// tiny pure functions.

/** [{trainee_id, project_name, handling_mode}] -> { [traineeId]: [{project_name, handling_mode}, ...] } */
export const groupProjectAssignmentsByTrainee = (assignments) => {
  const map = {};
  (assignments || []).forEach((a) => {
    if (!a?.trainee_id || !a?.project_name) return;
    if (!map[a.trainee_id]) map[a.trainee_id] = [];
    map[a.trainee_id].push({
      project_name: a.project_name,
      handling_mode: a.handling_mode || "solo",
    });
  });
  Object.values(map).forEach((list) =>
    list.sort((a, b) => a.project_name.localeCompare(b.project_name))
  );
  return map;
};
