export const ASSIGNMENTS = [
  {
    id: "sis",
    name: "SIS Assignment",
    csvUrl:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRdhlvmjnqv5YBTpK4oxX914j6HApyK26brmNyqqkIoKGDLJUPyigKBLOlgB4msgfEacRqTuDZtsU3C/pub?output=csv",
    skipCols: ["Added Time", "IP Address", "Name", "Overall Score", "Link"],
    scoreCol: "Overall Score",
    linkCol: "Link",
    nameCol: "Name",
  },
];

export const fetchAllAssignmentResults = async () => {
  const results = {};
  await Promise.all(
    ASSIGNMENTS.map(async (assignment) => {
      try {
        const res = await fetch(assignment.csvUrl, { cache: "no-store" });
        if (!res.ok) return;
        const text = await res.text();
        const Papa = (await import("papaparse")).default;
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        parsed.data.forEach((row) => {
          const name = (row[assignment.nameCol] || "").trim().toLowerCase();
          if (!name) return;
          if (!results[name]) results[name] = [];
          const score = parseFloat(row[assignment.scoreCol] || 0);
          const questions = parsed.meta.fields.filter(
            (f) => !assignment.skipCols.includes(f)
          );
          results[name].push({
            id: assignment.id,
            name: assignment.name,
            score,
            total: questions.length,
            link: row[assignment.linkCol] || null,
          });
        });
      } catch {
        // silent fail
      }
    })
  );
  return results;
};
