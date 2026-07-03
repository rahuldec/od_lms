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
    questions: [
      "Shift all boys from Class 11 Commerce to Class 11 Non-Medical in a single action.",
      "How many students are studying in the institute ?",
      "How many no. of students left the institute ?",
      "How to download multiple admit card in one go?",
      "In student Profile, create separate sections for it's 10th education details and 12th education details contains fields i.e. Max Marks, Obtained Marks, Result, School name, Board.",
      "Need a column of phone no. in inactive students excel export.",
      "Change display name of batch to semester.",
      "How many students are there in institute belongs to EWS/RTE/134A Category?",
      "How many current students in institute are using their student app?",
      "Provide negative feedback to a any student",
      "What do you mean by dormant student?",
      "How to inactive a student?",
      "Remove access to pay fee via student app.",
      "Promote one specific student to next session with dues",
      "How to upload student images in bulk?",
    ],
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
    questions: [
      "While creating a Fee Group, there is an option called \"Auto Awake Status\". What is the purpose of this option?",
      "Who are Dormant Students?",
      "Assign Flat 10% concession on tuition fee",
      "How to pay full fee in April Month?",
      "Receipt date not coming in daily collection report ? How to fix that?",
      "How to do fee adjustment and what is it's purpose?",
      "Print tuition fee certificate of any student",
      "How to collect Misc Fee?",
      "How to set separate receipt setting for each session?",
      "Minimum Payment Percentage is configured as 50%. A particular student is allowed to pay only 10% of the total fee due as an exception. Is it possible - If yes ? Then How?",
      "What happen if we enable auto adjust extra fee?",
      "What does it mean by \"Show Zero: No\" in due fee report ?",
      "How to cancel receipt?",
      "What's diff between txn list and daily fee report?",
      "Change default payment mode to Bnak Transfer",
    ],
  },
  {
    id: "academic",
    name: "Academic Module",
    csvUrl:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTiB9myHbpIiCVCK2Yikqy6VeQ_Lr6mt1XCdvQIxMdGQemIYpTp5UehEKN1GDiYQwRuBFB6tbuxGyzh/pub?gid=0&single=true&output=csv",
    scoreCol: "Overall Score",
    linkCol: "Link",
    nameCol: "Name",
    totalMarks: 15,
    passThreshold: 9,
    questions: [
      "Difference between optional and additional subject?",
      "Assign french as optional subject to any student in any class",
      "If the Periodic Test is conducted out of 50 marks and needs to be reflected as 10 marks on the report card, what weightage should be set in the assessment config??",
      "Use case of subject group",
      "Use case of display name",
      "Where to assign coordinator?",
      "How to update grading criteria in bulk ?",
      "Explain \"Include in total\" concept",
      "If I need to display only the Periodic Test marks on the report card without including them in the final result calculation, how should I configure the assessment setup?\"",
      "Explain sequence number setup in assessment group",
      "We have 2 assessments as UT I and UT II of marks 20 each but in report card it is showing as IA with marks 5. How?",
      "There is an assessment as Half Yearly, while doing marks entry for this assessment grades are coming as A, B, C but these should be A1, A2, B1, B2 and so on, fix it.",
      "On report card page client is not able to add working days present days, remark, result and is also not able to declare result for specific term, resolve it.",
      "Why do we different assessment modals, what do you understand by co-scholastic, displine, skill ?",
      "Assign a single coordinator to all classes and sections at once.",
    ],
  },
  {
    id: "attendance",
    name: "Attendance",
    csvUrl:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vSPHkFJjJ8CF7lXGPPNS1dAWpQwAVJ_EyIx-_afkvkSFZ0ggkowqwvuFkDOCzTlJfRx04Kf86RlOTo7/pub?output=csv",
    scoreCol: "Overall Score",
    linkCol: "Link",
    nameCol: "Name",
    totalMarks: 15,
    passThreshold: 9,
    questions: [
      "Is it mandatory to include a break in the timetable?",
      "How to add holiday attendance value?",
      "Where to check load of one specific employee?",
      "How to print attendance shortage letter?",
      "How can you check which teacher has not marked attendance? (School Case)",
      "How can i switch between day-wise and lecture-wise attendance?",
      "How to adjust lecture of any employee?",
      "How to check time table of any employee?",
      "Where can I check which students have applied for leave?",
      "How to delete lecture of a particular faculty member??",
      "Coordinator has assigned a time table of a course for a week. Now attendance is marked till Wednesday. Coordinator wants to add a new faculty from the starting of the week how can we do the same.",
      "Admin has adjusted one lecture to another faculty now the substituted faculty is also not available. Can we adjust the lecture again to another faculty?",
      "While marking the attendance from attendance page, we have A, P, L but H is not coming, why?",
      "Can we delete the lecture of a faculty for a specific course and semester. If yes how?",
      "Can we schedule time table wise attendance in school?",
    ],
  },
];

// Case-insensitive lookup of the first candidate column name that actually
// exists in a parsed CSV row. Falls back to null if none match.
const resolveColumn = (row, candidates) => {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const match = keys.find((k) => k.trim().toLowerCase() === candidate.trim().toLowerCase());
    if (match) return match;
  }
  return null;
};

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
          const scoreCol = assignment.scoreColCandidates
            ? resolveColumn(row, assignment.scoreColCandidates)
            : assignment.scoreCol;
          if (!scoreCol) return; // none of the candidate column names matched this sheet
          const score = parseFloat(row[scoreCol] || 0);

          // Build Q&A pairs
          const qa = (assignment.questions || []).map((q) => ({
            question: q,
            answer: (row[q] || "").trim(),
          }));

          results[name].push({
            id: assignment.id,
            name: assignment.name,
            score,
            total: assignment.totalMarks,
            passed: score >= assignment.passThreshold,
            link: row[assignment.linkCol] || null,
            qa,
          });
        });
      } catch (e) {
        console.error(`[${assignment.name}] fetch error:`, e);
      }
    })
  );
  return results;
};
