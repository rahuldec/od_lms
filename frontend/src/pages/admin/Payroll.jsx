import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { getLevelPeriods, daysBetween } from "@/lib/levelHistory";
import { IndianRupee, Download } from "lucide-react";
import { toast } from "sonner";

const navItems = [
  { to: "/admin", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/admin/trainees", label: "Trainees", testId: "nav-trainees", group: "Roster" },
  { to: "/admin/batches", label: "Batches", testId: "nav-batches", group: "Roster" },
  { to: "/admin/assignment-schedule", label: "Schedule", testId: "nav-assignment-schedule" },
  { to: "/admin/analytics", label: "Analytics", testId: "nav-analytics" },
  { to: "/admin/payroll", label: "Payroll", testId: "nav-payroll" },
  { to: "/admin/clients", label: "Clients", testId: "nav-clients", group: "Content" },
  { to: "/admin/resources", label: "Resources", testId: "nav-resources", group: "Content" },
  { to: "/admin/training-modules", label: "Training Modules", testId: "nav-training-modules", group: "Content" },
  { to: "/admin/webinars", label: "Webinars", testId: "nav-webinars", group: "Content" },
  { to: "/admin/results", label: "Results", testId: "nav-results", group: "Content" },
];

// Monthly rate per level - Level 0 is unpaid training, pay starts at
// promotion to Level 1 and changes exactly on each promotion's effective
// date (not at the start of the next month), so a mid-month promotion
// results in a prorated month split across both rates.
const LEVEL_RATES = { 0: 0, 1: 8000, 2: 10000, 3: 12000 };

const fmtINR = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const monthRange = (monthStr) => {
  // monthStr: "YYYY-MM". End is exclusive (first day of the next month),
  // matching the exclusive-end convention getLevelPeriods already uses.
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${monthStr}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { start, end };
};

const fmtMonthLabel = (monthStr) => {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

const todayMonthStr = () => new Date().toISOString().slice(0, 7);

export default function Payroll() {
  const [trainees, setTrainees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(todayMonthStr());

  useEffect(() => {
    (async () => {
      try {
        const data = await api.listTrainees();
        setTrainees(Array.isArray(data) ? data : []);
      } catch (e) {
        toast.error("Failed to load trainees");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const computedPayroll = useMemo(() => {
    const { start: monthStart, end: monthEnd } = monthRange(month);
    const daysInMonth = daysBetween(monthStart, monthEnd);
    const today = new Date().toISOString().slice(0, 10);

    const missingExitDate = [];
    const computed = trainees
      .filter((t) => t.department !== "Sales")
      .filter((t) => {
        // An Exited trainee with no recorded exit date can't be safely
        // capped - including them would risk paying them indefinitely as
        // if still active. Flag them instead of guessing.
        if (t.status === "Exited" && !t.exit_date) {
          missingExitDate.push(t);
          return false;
        }
        return true;
      })
      .map((t) => {
        // Caps the open-ended "current level" period at their exit date
        // instead of letting it run to today, so payroll stops accruing
        // exactly when they left, not when someone happens to view this page.
        const asOf = t.status === "Exited" && t.exit_date < today ? t.exit_date : today;
        const periods = getLevelPeriods(t, asOf);
        const breakdown = [];
        let total = 0;

        periods.forEach((p) => {
          const overlapStart = p.start < monthStart ? monthStart : p.start;
          const overlapEnd = p.end > monthEnd ? monthEnd : p.end;
          if (overlapStart >= overlapEnd) return;
          const days = daysBetween(overlapStart, overlapEnd);
          const rate = LEVEL_RATES[p.level] ?? 0;
          const amount = daysInMonth ? (rate / daysInMonth) * days : 0;
          if (days > 0) {
            breakdown.push({ level: p.level, days, amount });
            total += amount;
          }
        });

        return { trainee: t, breakdown, total: Math.round(total) };
      })
      .filter((r) => r.total > 0 || r.breakdown.length > 0)
      .sort((a, b) => (a.trainee.name || "").localeCompare(b.trainee.name || ""));

    return { rows: computed, missingExitDate };
  }, [trainees, month]);
  const { rows, missingExitDate } = computedPayroll;

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  const exportCsv = () => {
    const header = ["Name", "Username", "Department", "Breakdown", "Total (INR)"];
    const lines = rows.map((r) => {
      const breakdownText = r.breakdown
        .map((b) => `${b.days}d @ L${b.level} (${fmtINR(Math.round(b.amount))})`)
        .join(" + ");
      return [r.trainee.name, r.trainee.username, r.trainee.department || "", breakdownText, r.total].map(
        (v) => `"${String(v).replace(/"/g, '""')}"`
      ).join(",");
    });
    const csv = [header.join(","), ...lines, `,,,Total,${grandTotal}`].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell navItems={navItems} subtitle="Admin">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Finance</p>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">Payroll</h1>
          <p className="text-neutral-500 mt-2 max-w-xl">
            Level 1 ₹8,000 · Level 2 ₹10,000 · Level 3 ₹12,000 per month. A promotion's effective
            date is exactly when the rate changes - a mid-month promotion is split and prorated
            across both rates, not rounded to the month boundary.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="text-sm border border-neutral-200 rounded-full px-4 py-2 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <button
            onClick={exportCsv}
            disabled={loading || rows.length === 0}
            className="text-sm inline-flex items-center gap-2 rounded-full px-4 py-2 text-white font-medium disabled:opacity-50 flex-shrink-0"
            style={{ backgroundColor: "#E05A2B" }}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {missingExitDate.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-amber-50 text-amber-800 text-sm">
          <span className="font-medium">
            {missingExitDate.length} exited trainee{missingExitDate.length === 1 ? "" : "s"} excluded
          </span>{" "}
          - no exit date recorded, so payroll can't be safely calculated for them:{" "}
          {missingExitDate.map((t) => t.name).join(", ")}. Add an exit date on their trainee record
          to include them.
        </div>
      )}

      <Card className="rounded-2xl border-neutral-200/80 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{fmtMonthLabel(month)}</p>
            <p className="text-4xl font-semibold mt-2 tabular-nums">{loading ? "—" : fmtINR(grandTotal)}</p>
            <p className="text-sm text-neutral-500 mt-1">
              across {loading ? "-" : rows.length} trainee{rows.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl grid place-items-center flex-shrink-0" style={{ backgroundColor: "#FFF0E8", color: "#E05A2B" }}>
            <IndianRupee className="h-6 w-6" />
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border-neutral-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-100">
                <th className="px-5 py-3 font-medium">Trainee</th>
                <th className="px-5 py-3 font-medium">Department</th>
                <th className="px-5 py-3 font-medium">Breakdown</th>
                <th className="px-5 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-neutral-400">Loading...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-neutral-400">
                    No trainees earned payroll in {fmtMonthLabel(month)}.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.trainee.id} className="border-b border-neutral-50 hover:bg-neutral-50/60">
                    <td className="px-5 py-4 font-medium text-neutral-900">
                      {r.trainee.name}
                      {r.trainee.status === "Exited" && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-500">
                          Exited {r.trainee.exit_date}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-neutral-600">{r.trainee.department || "—"}</td>
                    <td className="px-5 py-4 text-neutral-600">
                      <div className="flex flex-wrap gap-1.5">
                        {r.breakdown.map((b, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200"
                          >
                            {b.days}d @ L{b.level} · {fmtINR(Math.round(b.amount))}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">{fmtINR(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
