import Papa from "papaparse";

const SHEET_ID = process.env.REACT_APP_SHEET_ID;
const sheetCsvUrl = (tab) => {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;
  return tab ? `${base}&sheet=${encodeURIComponent(tab)}` : base;
};

const SALES_SHEET_TAB = "Sales Training";

export const extractDriveFileId = (url) => {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/);
  if (m) return m[1];
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return m2[1];
  return null;
};

export const drivePreviewUrl = (url) => {
  const id = extractDriveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
};

// Parse rows from CSV → flat list of lessons grouped by modules.
// CSV columns: Sr No, Module, Days, Sub Parts, Link, Assignment
const parseModulesCsv = (text) => {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

  const modules = [];
  let currentModule = null;
  let currentDay = null;
  let orderCounter = 0;

  parsed.data.forEach((row, idx) => {
    const sr = (row["Sr No"] || "").toString().trim();
    const mod = (row["Module"] || "").toString().trim();
    const day = (row["Days"] || "").toString().trim();
    const sub = (row["Sub Parts"] || "").toString().trim();
    const link = (row["Link"] || "").toString().trim();
    const assignment = (row["Assignment"] || "").toString().trim();

    if (mod) {
      currentModule = {
        id: `m-${sr || idx}`,
        order: parseInt(sr, 10) || modules.length + 1,
        name: mod,
        lessons: [],
      };
      modules.push(currentModule);
    }
    if (day) currentDay = day;
    if (!currentModule) return;
    if (!sub && !link && !assignment) return;

    orderCounter += 1;
    const isAssignment =
      sub.toLowerCase() === "assignment" || (!link && !!assignment);
    const isReview = sub.toLowerCase() === "review";

    currentModule.lessons.push({
      id: `${currentModule.id}-l${orderCounter}`,
      moduleId: currentModule.id,
      moduleName: currentModule.name,
      day: currentDay || "",
      title: sub || (isAssignment ? "Assignment" : "Lesson"),
      videoUrl: link || null,
      videoEmbedUrl: drivePreviewUrl(link),
      assignmentUrl: assignment || null,
      kind: isAssignment ? "assignment" : isReview ? "review" : "video",
    });
  });

  return modules.filter((m) => m.lessons.length > 0);
};

const fetchModulesFromTab = async (tab, team) => {
  const res = await fetch(sheetCsvUrl(tab), { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch sheet");
  const text = await res.text();
  const modules = parseModulesCsv(text);
  if (team) {
    // Sr No numbering restarts per sheet tab, so IDs would otherwise
    // collide with the default tab's modules/lessons once merged into
    // one list (React keys, watch-progress lookups).
    const prefix = team.toLowerCase();
    modules.forEach((m) => {
      m.team = team;
      m.id = `${prefix}-${m.id}`;
      m.lessons.forEach((l) => {
        l.team = team;
        l.id = `${prefix}-${l.id}`;
        l.moduleId = m.id;
      });
    });
  }
  return modules;
};

// Cached in memory: every page (Dashboard, Learn, TrainingModules,
// TraineeDetail, BatchDetail, trainee Home) calls this on mount, and
// without caching that meant a fresh live fetch to Google Sheets on
// almost every page load in the app. Now the first call within the TTL
// window fetches for real; every other call (same page reload, or a
// different page mounting moments later) reuses the same result -
// or, if a fetch is already in flight, waits on that same request
// instead of firing a duplicate one.
const SHEET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const makeCachedFetcher = (fetchUncached) => {
  let cache = { data: null, fetchedAt: 0 };
  let inFlight = null;

  return async ({ force = false } = {}) => {
    const isFresh = cache.data && Date.now() - cache.fetchedAt < SHEET_CACHE_TTL_MS;
    if (isFresh && !force) return cache.data;

    if (inFlight) return inFlight;

    inFlight = fetchUncached()
      .then((modules) => {
        cache = { data: modules, fetchedAt: Date.now() };
        return modules;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
};

export const fetchSheetModules = makeCachedFetcher(() => fetchModulesFromTab(undefined, null));

export const fetchSalesSheetModules = makeCachedFetcher(() =>
  fetchModulesFromTab(SALES_SHEET_TAB, "Sales")
);
