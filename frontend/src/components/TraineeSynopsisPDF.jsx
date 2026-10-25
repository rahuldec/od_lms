/**
 * generateSynopsisPDF(trainees, data) → Blob
 *
 * Produces an Apple-style PDF synopsis for each trainee using jsPDF.
 * One page per trainee, A4 portrait.
 *
 * @param {Array}  trainees           - trainee objects from the API
 * @param {Object} data.clientsByTrainee    - { [id]: [{client_name, handling_mode}] }
 * @param {Object} data.visitsByTrainee     - { [id]: [{client_name, visit_count}] }
 * @param {Object} data.projectsByTrainee   - { [id]: [{project_name}] }
 * @param {Object} data.assignmentsByTrainee - { [id]: [{assignment_name, score, passed}] }
 * @param {Object} data.batchNameById       - { [batchId]: name }
 * @returns {Promise<Blob>}
 */
export async function generateSynopsisPDF(trainees, data) {
  const { jsPDF } = await import("jspdf");
  await import("jspdf-autotable");

  const {
    clientsByTrainee = {},
    visitsByTrainee  = {},
    projectsByTrainee = {},
    assignmentsByTrainee = {},
    batchNameById = {},
  } = data;

  // ── palette ────────────────────────────────────────────────────────────
  const ACCENT   = [236, 103, 36];   // #EC6724
  const INK      = [29,  29,  31];   // #1D1D1F
  const SOFT     = [110, 110, 115];  // #6E6E73
  const FAINT    = [134, 134, 139];  // #86868B
  const BORDER   = [210, 210, 215];  // #D2D2D7
  const PANEL    = [245, 245, 247];  // #F5F5F7
  const WHITE    = [255, 255, 255];
  const GOOD_BG  = [209, 250, 229];
  const GOOD_INK = [26,  102,  50];
  const BAD_BG   = [254, 226, 226];
  const BAD_INK  = [127,  29,  29];

  // ── helpers ─────────────────────────────────────────────────────────────
  const initials = (name) =>
    (name || "?").split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");

  const fmtDate = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const totalDays = (history) => {
    if (!history?.length) return 0;
    const start = new Date(history[0].from);
    return Math.max(0, Math.floor((Date.now() - start) / 86400000));
  };

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const ML = 16, MR = 16, MT = 16;
  const CW = W - ML - MR; // content width

  const levelColors = [
    [142, 142, 147],  // L0 grey
    [236, 103,  36],  // L1 orange
    [129,  26,  15],  // L2 maroon
  ];

  // ── draw one page per trainee ──────────────────────────────────────────
  trainees.forEach((t, ti) => {
    if (ti > 0) doc.addPage();

    let y = MT;

    const history   = Array.isArray(t.history) ? t.history : [];
    const visits    = (visitsByTrainee[t.id] || []).filter((v) => v.visit_count > 0).sort((a, b) => b.visit_count - a.visit_count);
    const clients   = clientsByTrainee[t.id] || [];
    const projects  = projectsByTrainee[t.id] || [];
    const assigns   = (assignmentsByTrainee[t.id] || []).filter((a) => a.score != null);
    const days      = totalDays(history);
    const curLevel  = history.length ? history[history.length - 1].level : 0;
    const totalVis  = visits.reduce((s, v) => s + v.visit_count, 0);
    const passed    = assigns.filter((a) => (a.score || 0) >= 70).length;
    const avgScore  = assigns.length
      ? Math.round(assigns.reduce((s, a) => s + (a.score || 0), 0) / assigns.length)
      : null;
    const batchName = t.batch_id ? batchNameById[t.batch_id] : null;

    // ── avatar circle ─────────────────────────────────────────────────────
    const AV_R = 11;
    const AV_X = ML + AV_R;
    const AV_Y = y + AV_R;

    if (t.photo_url) {
      try {
        doc.addImage(t.photo_url, "JPEG", ML, y, AV_R * 2, AV_R * 2, undefined, "FAST");
      } catch {
        // fall through to initials
        doc.setFillColor(...ACCENT);
        doc.circle(AV_X, AV_Y, AV_R, "F");
        doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...WHITE);
        doc.text(initials(t.name), AV_X, AV_Y + 0.5, { align: "center", baseline: "middle" });
      }
    } else {
      doc.setFillColor(...ACCENT);
      doc.circle(AV_X, AV_Y, AV_R, "F");
      doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...WHITE);
      doc.text(initials(t.name), AV_X, AV_Y + 0.5, { align: "center", baseline: "middle" });
    }

    // ── name + handle ─────────────────────────────────────────────────────
    const TX = ML + AV_R * 2 + 4;
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...INK);
    doc.text(t.name || "—", TX, y + 7);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...FAINT);
    doc.text(`@${t.username || ""}`, TX, y + 13);

    // chips row
    let cx = TX;
    const chipY = y + 18;
    const chips = [
      t.status || "Active",
      `L${curLevel}`,
      t.department,
      batchName,
    ].filter(Boolean);
    chips.forEach((label) => {
      const w = doc.getTextWidth(label) + 6;
      doc.setFillColor(...PANEL).setDrawColor(...BORDER);
      doc.roundedRect(cx, chipY - 3, w, 6, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...SOFT);
      doc.text(label, cx + 3, chipY + 0.8);
      cx += w + 2;
    });

    // days counter (top right)
    doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...INK);
    doc.text(String(days), W - MR, y + 9, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...FAINT);
    doc.text("days in program", W - MR, y + 14, { align: "right" });

    y += AV_R * 2 + 6;

    // ── level timeline bar ────────────────────────────────────────────────
    if (history.length) {
      const barH = 7;
      const totalD = totalDays(history);
      let bx = ML;
      history.forEach((h) => {
        const from = new Date(h.from);
        const to   = h.to ? new Date(h.to) : new Date();
        const d    = Math.max(1, Math.floor((to - from) / 86400000));
        const segW = totalD ? (d / totalD) * CW : CW;
        const col  = levelColors[h.level] || FAINT;
        doc.setFillColor(...col);
        doc.rect(bx, y, segW, barH, "F");
        doc.setFont("helvetica", "bold").setFontSize(6).setTextColor(255, 255, 255);
        if (segW > 14) doc.text(`L${h.level} · ${d}d`, bx + segW / 2, y + barH / 2 + 0.8, { align: "center" });
        bx += segW;
      });
      y += barH + 2;
      // date labels
      doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(...FAINT);
      history.forEach((h, i) => {
        const from = new Date(h.from);
        const to   = h.to ? new Date(h.to) : new Date();
        const d    = Math.max(1, Math.floor((to - from) / 86400000));
        const segW = totalD ? (d / totalD) * CW : CW;
        doc.text(`L${h.level}: ${fmtDate(h.from)}`, ML + (i === 0 ? 0 : CW * (history.slice(0, i).reduce((s, hh) => {
          const dd = Math.max(1, Math.floor((new Date(hh.to || Date.now()) - new Date(hh.from)) / 86400000));
          return s + dd / totalD;
        }, 0))), y);
      });
      y += 5;
    }

    // ── two-column body ───────────────────────────────────────────────────
    const COL_GAP = 5;
    const COL_W   = (CW - COL_GAP) / 2;
    const LCOL    = ML;
    const RCOL    = ML + COL_W + COL_GAP;
    const FOOTER_H = 10;
    const BODY_H   = H - y - MT - FOOTER_H;

    // helper: draw a section label
    const secLabel = (label, x, sy) => {
      doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...FAINT);
      doc.text(label.toUpperCase(), x, sy);
      return sy + 4;
    };

    // helper: mini table
    const miniTable = (x, sy, colW, rows, hasBorder = true) => {
      rows.forEach((row, i) => {
        if (hasBorder && i > 0) {
          doc.setDrawColor(...BORDER);
          doc.line(x, sy - 0.5, x + colW, sy - 0.5);
        }
        const [left, right] = row;
        doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...SOFT);
        doc.text(String(left || "").substring(0, 38), x, sy);
        if (right !== undefined) {
          doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...INK);
          doc.text(String(right), x + colW - 1, sy, { align: "right" });
        }
        sy += 5;
      });
      return sy;
    };

    let ly = y;   // left column y
    let ry = y;   // right column y

    // LEFT: Clients
    if (clients.length) {
      ly = secLabel(`Clients · ${clients.length} assigned`, LCOL, ly);
      const visitMap = {};
      visits.forEach((v) => { visitMap[v.client_name.trim().toLowerCase()] = v.visit_count; });
      const rows = clients.map((c) => {
        const vc = visitMap[c.client_name.trim().toLowerCase()] || 0;
        return [c.client_name, vc > 0 ? vc : "—"];
      });
      ly = miniTable(LCOL, ly, COL_W, rows);
      ly += 3;
    }

    // LEFT: All Visits summary
    if (visits.length) {
      ly = secLabel(`All Visits · ${totalVis} total`, LCOL, ly);
      const rows = visits.slice(0, 8).map((v) => [v.client_name, v.visit_count]);
      if (visits.length > 8) rows.push([`+${visits.length - 8} more`, ""]);
      ly = miniTable(LCOL, ly, COL_W, rows);
      ly += 3;
    }

    // LEFT: Projects
    if (projects.length) {
      ly = secLabel("Projects", LCOL, ly);
      const rows = projects.map((p) => [p.project_name]);
      ly = miniTable(LCOL, ly, COL_W, rows);
      ly += 3;
    }

    // RIGHT: Learning phase
    if (assigns.length) {
      ry = secLabel(`Learning Phase · ${passed}/${assigns.length} passed${avgScore != null ? ` · avg ${avgScore}%` : ""}`, RCOL, ry);
      assigns.forEach((a, i) => {
        if (i > 0) {
          doc.setDrawColor(...BORDER);
          doc.line(RCOL, ry - 0.5, RCOL + COL_W, ry - 0.5);
        }
        const ok = (a.score || 0) >= 70;
        doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...SOFT);
        doc.text(String(a.assignment_name || "").substring(0, 30), RCOL, ry);
        // score pill
        const scoreStr = `${a.score}%`;
        const pw = doc.getTextWidth(scoreStr) + 5;
        doc.setFillColor(...(ok ? GOOD_BG : BAD_BG));
        doc.roundedRect(RCOL + COL_W - pw, ry - 3.5, pw, 5, 1, 1, "F");
        doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...(ok ? GOOD_INK : BAD_INK));
        doc.text(scoreStr, RCOL + COL_W - pw / 2, ry + 0.3, { align: "center" });
        ry += 5;
      });
      ry += 3;
    }

    // RIGHT: CSAT
    if (t.csat_score != null) {
      ry = secLabel("CSAT Score", RCOL, ry);
      doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...ACCENT);
      doc.text(String(t.csat_score), RCOL, ry + 6);
      ry += 12;
    }

    // RIGHT: Remarks
    if (t.notes) {
      ry = secLabel("Remarks", RCOL, ry);
      const lines = doc.splitTextToSize(t.notes, COL_W);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...SOFT);
      doc.text(lines.slice(0, 8), RCOL, ry);
      ry += lines.slice(0, 8).length * 4 + 3;
    }

    // ── footer ────────────────────────────────────────────────────────────
    const footY = H - MT;
    doc.setDrawColor(...BORDER).line(ML, footY - 5, W - MR, footY - 5);
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...FAINT);
    doc.text(`Generated ${today} · Okie Dokie Training Program`, ML, footY);
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...ACCENT);
    doc.text("CONFIDENTIAL", W - MR, footY, { align: "right" });

    // page number
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...FAINT);
    doc.text(`${ti + 1} / ${trainees.length}`, W / 2, footY, { align: "center" });
  });

  return doc.output("blob");
}
