import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ORANGE = "#E05A2B";

/**
 * Log how many visits a trainee has made to each of their assigned clients.
 *
 * Deliberately a number entered per client rather than a +/- counter on the
 * card itself - the count is the total visits done, typed once, not
 * something clicked up one at a time.
 *
 * Props:
 *   trainee     the trainee being edited
 *   clients     [{client_name, handling_mode}] this trainee is assigned to -
 *               visits only make sense for clients already on their book
 *   visits      { [clientNameLower]: count } current counts
 *   onSaved([{client_name, visit_count}])   called with the rows that changed
 *   onClose
 */
export default function VisitLogDialog({ trainee, clients = [], visits = {}, onSaved, onClose }) {
  const [counts, setCounts] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCounts(
      Object.fromEntries(
        clients.map((c) => [c.client_name, String(visits[c.client_name.trim().toLowerCase()] || 0)])
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainee?.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setCount = (name, value) => {
    if (value !== "" && !/^\d+$/.test(value)) return;
    setCounts((prev) => ({ ...prev, [name]: value }));
  };

  const save = async () => {
    const changed = clients.filter((c) => {
      const before = visits[c.client_name.trim().toLowerCase()] || 0;
      const after = parseInt(counts[c.client_name] || "0", 10);
      return after !== before;
    });
    if (changed.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    const saved = [];
    let failed = 0;
    for (const c of changed) {
      const visit_count = parseInt(counts[c.client_name] || "0", 10);
      try {
        await api.setClientVisit(trainee.id, c.client_name, visit_count);
        saved.push({ client_name: c.client_name, visit_count });
      } catch {
        failed += 1;
      }
    }
    setSaving(false);

    if (failed) toast.error(`${failed} of ${changed.length} visit count${changed.length === 1 ? "" : "s"} could not be saved`);
    else toast.success(`Visit count${saved.length === 1 ? "" : "s"} updated for ${trainee.name}`);

    if (saved.length) onSaved?.(saved);
    if (!failed) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        data-testid="visit-log-dialog"
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 flex-shrink-0">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">
              Log client visits
            </p>
            <p className="font-semibold text-lg">{trainee?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-neutral-100 grid place-items-center"
          >
            <X className="h-4 w-4 text-neutral-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {clients.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8">
              Assign a client to this trainee first - visits are tracked per client.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-50">
              {clients.map((c) => (
                <li key={c.client_name} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-sm font-medium text-neutral-800 truncate">
                    {c.client_name}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={counts[c.client_name] ?? "0"}
                    onChange={(e) => setCount(c.client_name, e.target.value)}
                    className="w-16 text-sm text-right border border-neutral-200 rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200 tabular-nums"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-full border border-neutral-200 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || clients.length === 0}
            className="text-sm px-5 py-2 rounded-full text-white font-medium inline-flex items-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: ORANGE }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
