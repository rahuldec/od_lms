import Papa from "papaparse";

// Live client list, read from the "CS Team Plan" workbook in Drive.
//
// Nothing about clients is stored in Supabase - the sheet stays the single
// source of truth for who the clients are, their segment and their owning RM.
// Only the trainee<->client mapping is persisted (see api.setTraineeClients).
// That means a client added or renamed in the sheet shows up here on the next
// load without any import step; a *rename* will orphan its assignments, which
// is surfaced in the Clients page as an "unknown client" row rather than
// silently dropped.
//
// --- Configuration --------------------------------------------------------
// Read from the published-to-web CSV of the CS Team Plan workbook. That
// workbook is an uploaded .xlsx, which Google will not serve through the
// /export or /gviz endpoints - only a "Publish to web" link works, the same
// arrangement the assignment-result sheets in lib/assignments.js use.
//
// The published link is the default so the app works with no config.
// REACT_APP_CLIENTS_CSV_URL overrides it. Note that re-publishing mints a NEW
// /d/e/ id: the old link keeps serving a stale snapshot rather than erroring,
// so if clients stop appearing, check this URL before anything else.
const DEFAULT_CLIENTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRJduuwLQYkHFCDbGo1J-kGu8gNWH3CX7dD8vVekiztMWxuiJIY1wptsW4eGgO5wg/pub?gid=667331627&single=true&output=csv";

const clientsCsvUrl = () =>
  process.env.REACT_APP_CLIENTS_CSV_URL || DEFAULT_CLIENTS_CSV_URL;

// The workbook has several tabs with overlapping but not identical headers
// (Clients vs the two Retention analysis grids), and headers drift - "Team"
// became the owning RM at some point while the "RM" column went stale. Resolve
// by trying candidates in priority order instead of hard-coding one name.
const COLUMNS = {
  srNo: ["Sr No.", "Sr No", "S.No", "Sno"],
  name: ["Client Name", "Client", "Name"],
  owner: ["Team", "Client Ownership", "RM", "Owner"],
  segment: ["TYPE1", "Type1", "Segment"],
  category: ["Category", "Size"],
  tier: ["Type", "Tier"],
  oldNew: ["Old/New", "Old / New"],
  billing: ["Total Billing FY", "Total Billing", "Billing", "Revenue"],
};

const resolveColumn = (row, candidates) => {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const match = keys.find(
      (k) => k.trim().toLowerCase() === candidate.trim().toLowerCase()
    );
    if (match) return match;
  }
  return null;
};

const cell = (row, key) => (key ? (row[key] || "").toString().trim() : "");

// Strips "₹", commas and stray text so Total Billing FY sorts numerically.
const parseAmount = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};

const parseClientsCsv = (text) => {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const first = parsed.data[0];
  if (!first) return [];

  const cols = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, candidates]) => [
      k,
      resolveColumn(first, candidates),
    ])
  );
  if (!cols.name) {
    // Almost always a wrong gid - the published link points at another tab.
    // Echo the headers back so the mismatch is diagnosable from the UI banner
    // rather than needing devtools.
    const found = Object.keys(first).slice(0, 12).join(", ");
    throw new Error(
      `No client-name column in the published sheet. Columns found: ${found || "(none)"}`
    );
  }

  const clients = [];
  const seen = new Set();

  parsed.data.forEach((row) => {
    const name = cell(row, cols.name);
    if (!name) return;

    // Below the numbered block the sheet carries scratch rows - "Daily work
    // track" trackers, prospect notes sitting in the wrong columns, a stray
    // duplicate. Every real client carries a Sr No., so filter on that rather
    // than on "has a name", which sweeps the scratch in.
    if (cols.srNo && !cell(row, cols.srNo)) return;

    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    clients.push({
      id: key,
      name,
      owner: cell(row, cols.owner) === "-" ? "" : cell(row, cols.owner),
      segment: cell(row, cols.segment),
      category: cell(row, cols.category),
      tier: cell(row, cols.tier),
      isNew: cell(row, cols.oldNew).toLowerCase() === "new",
      billing: parseAmount(cell(row, cols.billing)),
    });
  });

  return clients.sort((a, b) => a.name.localeCompare(b.name));
};

// Same caching contract as fetchSheetModules: one live fetch per TTL window,
// and concurrent callers share the in-flight request rather than each firing
// their own. The Dashboard and the Clients page both want this on mount.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { data: null, fetchedAt: 0 };
let inFlight = null;

export const fetchClients = async ({ force = false } = {}) => {
  const isFresh = cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
  if (isFresh && !force) return cache.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await fetch(clientsCsvUrl(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch client sheet (${res.status})`);
    return parseClientsCsv(await res.text());
  })()
    .then((clients) => {
      cache = { data: clients, fetchedAt: Date.now() };
      return clients;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

// --- Shaping helpers shared by the dashboard and the Clients page ----------

/** [{trainee_id, client_name}] -> { [traineeId]: [clientName, ...] } */
/** [{trainee_id, client_name, handling_mode}] -> { [traineeId]: [{client_name, handling_mode}, ...] } */
export const groupAssignmentsByTrainee = (assignments) => {
  const map = {};
  (assignments || []).forEach((a) => {
    if (!a?.trainee_id || !a?.client_name) return;
    if (!map[a.trainee_id]) map[a.trainee_id] = [];
    map[a.trainee_id].push({
      client_name: a.client_name,
      handling_mode: a.handling_mode || "solo",
    });
  });
  Object.values(map).forEach((list) =>
    list.sort((a, b) => a.client_name.localeCompare(b.client_name))
  );
  return map;
};

/** [{trainee_id, client_name, handling_mode}] -> { [clientNameLower]: [{trainee_id, handling_mode}, ...] } */
export const groupAssignmentsByClient = (assignments) => {
  const map = {};
  (assignments || []).forEach((a) => {
    if (!a?.trainee_id || !a?.client_name) return;
    const key = a.client_name.trim().toLowerCase();
    if (!map[key]) map[key] = [];
    map[key].push({ trainee_id: a.trainee_id, handling_mode: a.handling_mode || "solo" });
  });
  return map;
};

export const CLIENT_FILTER_FIELDS = ["segment", "category", "tier", "owner"];

/** Distinct non-empty values per filterable field, for the filter dropdowns. */
export const clientFacets = (clients) => {
  const facets = {};
  CLIENT_FILTER_FIELDS.forEach((field) => {
    facets[field] = Array.from(
      new Set((clients || []).map((c) => c[field]).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  });
  return facets;
};
