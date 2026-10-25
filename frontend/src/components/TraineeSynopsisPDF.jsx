import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// ── palette ────────────────────────────────────────────────────────────────
const C = {
  accent:    "#EC6724",
  accentDk:  "#C4501A",
  accentBg:  "#FDF0E8",
  ink:       "#1D1D1F",
  soft:      "#6E6E73",
  faint:     "#86868B",
  border:    "#D2D2D7",
  panel:     "#F5F5F7",
  white:     "#FFFFFF",
  good:      "#1a6632",
  goodBg:    "#D1FAE5",
  bad:       "#7f1d1d",
  badBg:     "#FEE2E2",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.white,
    fontFamily: "Helvetica",
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
  },

  // ── header ──────────────────────────────────────────────────────────────
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 20 },
  avatarWrap: {
    width: 64, height: 64, borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: "center", justifyContent: "center",
    marginRight: 16, flexShrink: 0,
  },
  avatarPhoto: { width: 64, height: 64, borderRadius: 14, objectFit: "cover" },
  avatarInitials: { color: C.white, fontSize: 24, fontFamily: "Helvetica-Bold" },
  headerMeta: { flex: 1 },
  headerName: { fontSize: 22, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 2 },
  headerHandle: { fontSize: 11, color: C.faint, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99,
    border: `1pt solid ${C.border}`,
    fontSize: 9, fontFamily: "Helvetica-Bold",
    color: C.soft, backgroundColor: C.panel,
    marginRight: 4, marginBottom: 2,
  },
  chipAccent: { backgroundColor: C.accentBg, color: C.accentDk, borderColor: "transparent" },
  chipGood: { backgroundColor: C.goodBg, color: C.good, borderColor: "transparent" },
  headerRight: { alignItems: "flex-end" },
  daysBadge: { fontSize: 28, fontFamily: "Helvetica-Bold", color: C.ink },
  daysSub: { fontSize: 9, color: C.faint, textAlign: "right" },

  // ── level bar ───────────────────────────────────────────────────────────
  timelineWrap: { marginBottom: 20 },
  timelineBar: { flexDirection: "row", height: 20, borderRadius: 6, overflow: "hidden", marginBottom: 4 },
  timelineSeg: { alignItems: "center", justifyContent: "center" },
  timelineLabel: { color: C.white, fontSize: 8, fontFamily: "Helvetica-Bold" },
  timelineMeta: { flexDirection: "row", justifyContent: "space-between" },
  timelineMetaItem: { fontSize: 8, color: C.faint },

  // ── section header ──────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 8, fontFamily: "Helvetica-Bold",
    color: C.faint, textTransform: "uppercase", letterSpacing: 0.6,
    marginBottom: 6,
  },

  // ── well (grey sub-panel) ───────────────────────────────────────────────
  well: {
    backgroundColor: C.panel, borderRadius: 10,
    border: `0.5pt solid ${C.border}`,
    padding: 10, marginBottom: 10,
  },

  // ── two-col layout ──────────────────────────────────────────────────────
  twoCol: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },

  // ── table ───────────────────────────────────────────────────────────────
  tableHead: {
    flexDirection: "row",
    borderBottom: `0.5pt solid ${C.border}`,
    paddingBottom: 4, marginBottom: 4,
  },
  tableHeadCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.faint, flex: 1 },
  tableHeadCellR: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.faint, width: 40, textAlign: "right" },
  tableRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 3,
    borderBottom: `0.5pt solid ${C.border}`,
  },
  tableRowLast: { borderBottom: "none" },
  tableCell: { fontSize: 9, color: C.soft, flex: 1 },
  tableCellR: { fontSize: 9, color: C.ink, fontFamily: "Helvetica-Bold", width: 40, textAlign: "right" },

  // ── score pill ──────────────────────────────────────────────────────────
  scorePill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    fontSize: 9, fontFamily: "Helvetica-Bold",
  },

  // ── remarks ─────────────────────────────────────────────────────────────
  remarksText: { fontSize: 9.5, color: C.soft, lineHeight: 1.5 },

  // ── footer ──────────────────────────────────────────────────────────────
  footer: {
    position: "absolute", bottom: 20, left: 40, right: 40,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderTop: `0.5pt solid ${C.border}`, paddingTop: 8,
  },
  footerLeft: { fontSize: 8, color: C.faint },
  footerRight: { fontSize: 8, color: C.accent, fontFamily: "Helvetica-Bold" },
});

// ── helpers ─────────────────────────────────────────────────────────────────

const initials = (name) =>
  (name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

const levelColors = ["#8E8E93", "#EC6724", "#811A0F"];

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const totalDays = (history) => {
  if (!history?.length) return 0;
  const start = new Date(history[0].from);
  const end = new Date();
  return Math.max(0, Math.floor((end - start) / 86400000));
};

const levelSegments = (history) => {
  if (!history?.length) return [];
  const segs = [];
  const total = totalDays(history);
  if (!total) return [];
  history.forEach((h, i) => {
    const from = new Date(h.from);
    const to = h.to ? new Date(h.to) : new Date();
    const days = Math.max(1, Math.floor((to - from) / 86400000));
    segs.push({ level: h.level, days, pct: (days / total) * 100 });
  });
  return segs;
};

// ── per-trainee page ────────────────────────────────────────────────────────

const TraineePage = ({ trainee, clients, visitRows, projects, assignments, batchName, history }) => {
  const segs = levelSegments(history);
  const days = totalDays(history);
  const currentLevel = history?.length ? history[history.length - 1].level : 0;

  const visits = (visitRows || [])
    .filter((v) => v.visit_count > 0)
    .sort((a, b) => b.visit_count - a.visit_count);
  const totalVisits = visits.reduce((s, v) => s + v.visit_count, 0);

  const assignedModules = (assignments || []).filter((a) => a.score !== null && a.score !== undefined);
  const avgScore = assignedModules.length
    ? Math.round(assignedModules.reduce((s, a) => s + (a.score || 0), 0) / assignedModules.length)
    : null;
  const passed = assignedModules.filter((a) => (a.score || 0) >= 70).length;

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Page size="A4" style={styles.page}>

      {/* ── header ── */}
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          {trainee.photo_url ? (
            <Image src={trainee.photo_url} style={styles.avatarPhoto} />
          ) : (
            <Text style={styles.avatarInitials}>{initials(trainee.name)}</Text>
          )}
        </View>

        <View style={styles.headerMeta}>
          <Text style={styles.headerName}>{trainee.name}</Text>
          <Text style={styles.headerHandle}>@{trainee.username}</Text>
          <View style={styles.chipRow}>
            <Text style={[styles.chip, trainee.status === "Active" ? styles.chipGood : {}]}>
              {trainee.status || "Active"}
            </Text>
            <Text style={[styles.chip, styles.chipAccent]}>L{currentLevel}</Text>
            {trainee.department && <Text style={styles.chip}>{trainee.department}</Text>}
            {batchName && <Text style={styles.chip}>{batchName}</Text>}
            {trainee.join_date && (
              <Text style={styles.chip}>Joined {fmtDate(trainee.join_date)}</Text>
            )}
          </View>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.daysBadge}>{days}</Text>
          <Text style={styles.daysSub}>days in program</Text>
        </View>
      </View>

      {/* ── level timeline ── */}
      {segs.length > 0 && (
        <View style={styles.timelineWrap}>
          <View style={styles.timelineBar}>
            {segs.map((s, i) => (
              <View
                key={i}
                style={[
                  styles.timelineSeg,
                  { flex: s.pct, backgroundColor: levelColors[s.level] || C.faint },
                ]}
              >
                <Text style={styles.timelineLabel}>L{s.level} · {s.days}d</Text>
              </View>
            ))}
          </View>
          <View style={styles.timelineMeta}>
            {history.map((h, i) => (
              <Text key={i} style={styles.timelineMetaItem}>
                L{h.level}: {fmtDate(h.from)}{h.to ? ` → ${fmtDate(h.to)}` : " → now"}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* ── main two-col body ── */}
      <View style={styles.twoCol}>

        {/* LEFT: Clients + Visits */}
        <View style={styles.col}>

          {/* Clients */}
          {clients?.length > 0 && (
            <View style={styles.well}>
              <Text style={styles.sectionTitle}>Clients · {clients.length} assigned</Text>
              <View style={styles.tableHead}>
                <Text style={styles.tableHeadCell}>Client</Text>
                <Text style={styles.tableHeadCellR}>Visits</Text>
              </View>
              {clients.map((c, i) => {
                const vc = visits.find(
                  (v) => v.client_name.trim().toLowerCase() === c.client_name.trim().toLowerCase()
                )?.visit_count || 0;
                return (
                  <View key={c.client_name} style={[styles.tableRow, i === clients.length - 1 ? styles.tableRowLast : {}]}>
                    <Text style={styles.tableCell}>{c.client_name}</Text>
                    <Text style={[styles.tableCellR, { color: vc > 0 ? C.accent : C.faint }]}>
                      {vc > 0 ? vc : "—"}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* All visits summary */}
          {visits.length > 0 && (
            <View style={styles.well}>
              <Text style={styles.sectionTitle}>All Visits · {totalVisits} total</Text>
              <View style={styles.tableHead}>
                <Text style={styles.tableHeadCell}>Client</Text>
                <Text style={styles.tableHeadCellR}>Count</Text>
              </View>
              {visits.slice(0, 10).map((v, i) => (
                <View key={v.client_name} style={[styles.tableRow, i === Math.min(visits.length, 10) - 1 ? styles.tableRowLast : {}]}>
                  <Text style={styles.tableCell}>{v.client_name}</Text>
                  <Text style={styles.tableCellR}>{v.visit_count}</Text>
                </View>
              ))}
              {visits.length > 10 && (
                <Text style={{ fontSize: 8, color: C.faint, marginTop: 4 }}>
                  +{visits.length - 10} more clients
                </Text>
              )}
            </View>
          )}

          {/* Projects */}
          {projects?.length > 0 && (
            <View style={styles.well}>
              <Text style={styles.sectionTitle}>Projects</Text>
              {projects.map((p, i) => (
                <View key={p.project_name} style={[styles.tableRow, i === projects.length - 1 ? styles.tableRowLast : {}]}>
                  <Text style={styles.tableCell}>{p.project_name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* RIGHT: Learning + Remarks + CSAT */}
        <View style={styles.col}>

          {/* Learning phase */}
          {assignedModules.length > 0 && (
            <View style={styles.well}>
              <Text style={styles.sectionTitle}>
                Learning Phase · {passed}/{assignedModules.length} passed
                {avgScore !== null ? ` · avg ${avgScore}%` : ""}
              </Text>
              <View style={styles.tableHead}>
                <Text style={styles.tableHeadCell}>Assignment</Text>
                <Text style={styles.tableHeadCellR}>Score</Text>
              </View>
              {assignedModules.map((a, i) => {
                const ok = (a.score || 0) >= 70;
                return (
                  <View key={a.assignment_name} style={[styles.tableRow, i === assignedModules.length - 1 ? styles.tableRowLast : {}]}>
                    <Text style={[styles.tableCell, { fontSize: 8.5 }]} numberOfLines={1}>
                      {a.assignment_name}
                    </Text>
                    <View style={{ width: 40, alignItems: "flex-end" }}>
                      <Text
                        style={[
                          styles.scorePill,
                          { backgroundColor: ok ? C.goodBg : C.badBg, color: ok ? C.good : C.bad },
                        ]}
                      >
                        {a.score}%
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* CSAT */}
          {trainee.csat_score != null && (
            <View style={[styles.well, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
              <Text style={styles.sectionTitle}>CSAT Score</Text>
              <Text style={{ fontSize: 22, fontFamily: "Helvetica-Bold", color: C.accent }}>
                {trainee.csat_score}
              </Text>
            </View>
          )}

          {/* Remarks */}
          {trainee.notes && (
            <View style={styles.well}>
              <Text style={styles.sectionTitle}>Remarks</Text>
              <Text style={styles.remarksText}>{trainee.notes}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── footer ── */}
      <View style={styles.footer} fixed>
        <Text style={styles.footerLeft}>Generated {today} · Okie Dokie Training Program</Text>
        <Text style={styles.footerRight}>CONFIDENTIAL</Text>
      </View>
    </Page>
  );
};

// ── document ────────────────────────────────────────────────────────────────

const TraineeSynopsisPDF = ({ trainees, clientsByTrainee, visitsByTrainee, projectsByTrainee, assignmentsByTrainee, batchNameById, historyByTrainee }) => (
  <Document
    title="Trainee Synopsis"
    author="Okie Dokie Training"
    creator="OD LMS"
  >
    {trainees.map((t) => (
      <TraineePage
        key={t.id}
        trainee={t}
        clients={clientsByTrainee[t.id] || []}
        visitRows={visitsByTrainee[t.id] || []}
        projects={projectsByTrainee[t.id] || []}
        assignments={assignmentsByTrainee[t.id] || []}
        batchName={t.batch_id ? batchNameById[t.batch_id] : null}
        history={historyByTrainee[t.id] || []}
      />
    ))}
  </Document>
);

export default TraineeSynopsisPDF;
