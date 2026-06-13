export const ASSIGNMENTS = [
  {
    id: "sis",
    name: "SIS",
    csvUrl:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRdhlvmjnqv5YBTpK4oxX914j6HApyK26brmNyqqkIoKGDLJUPyigKBLOlgB4msgfEacRqTuDZtsU3C/pub?gid=0&single=true&output=csv",
    scoreCol: "Overall Score",
    linkCol: "Link",
    nameCol: "Name",
    totalMarks: 15,
    passThreshold: 9,
  },
  {
    id: "fee",
    name: "Fee Module",
    csvUrl:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vShKF5uOw7P4V-fuKcGVWCkqBlHHhmFAjH_U5v-rBzONjN9bq813_yQnAbsyOQBlfT6hIDDYxi_YJxz/pub?output=csv",
    scoreCol: "Overall Score",
    linkCol: "Link",
    nameCol: "Name",
    totalMarks: 15,
    passThreshold: 9,
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

        if (parsed.data.length > 0) {
          console.log(`[${assignment.name}] Headers:`, Object.keys(parsed.data[0]));
        }

        parsed.data.forEach((row) => {
          const name = (row[assignment.nameCol] || "").trim().toLowerCase();
          if (!name) return;
          if (!results[name]) results[name] = [];
          const score = parseFloat(row[assignment.scoreCol] || 0);
          results[name].push({
            id: assignment.id,
            name: assignment.name,
            score,
            total: assignment.totalMarks,
            passed: score >= assignment.passThreshold,
            link: row[assignment.linkCol] || null,
          });
        });
      } catch (e) {
        console.error(`[${assignment.name}] fetch error:`, e);
      }
    })
  );

  console.log("[assignments] Final results map:", results);

  return results;
};
