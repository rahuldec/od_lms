import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { X, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ORANGE = "#E05A2B";

/**
 * Log how many visits a trainee has made to clients.
 *
 * Pulls from the full client sheet rather than just the trainee's assigned
 * book - a visit can happen with any client, assigned or not, so narrowing
 * the picker to "clients on this trainee's book" would make it impossible
 * to log a one-off visit elsewhere.
 *
 * Props:
 *   trainee      the trainee being edited
 *   allClients   full client list from the sheet (lib/clients.js fetchClients)
 *   visits       [{client_name, visit_count}] this trainee's current counts
 *   onSaved([{client_name, visit_count}])   called with the rows that changed
 *   onClose
 */
export default function VisitLogDialog({ trainee, allClients = [], visits = [], onClose, onSaved }) {
  const [counts, setCounts] = useState({});
  const [query, setQuery] = useState("");
  const [onlyLogged, setOnlyLogged] = useState(false);
  const [saving, setSaving] = useState(false);

  const originalByName = useMemo(() => {
    const map = {};
    visits.forEach((v) => {
      map[v.client_name.trim().toLowerCase()] = v.visit_count || 0;
    });
    return map;
  }, [visits]);

  useEffect(() => {
    setCounts(Object.fromEntries(visits.map((v) => [v.client_name, String(v.visit_count || 0)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainee?.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const countFor = (name) => {
    if (counts[name] !== undefined) return counts[name];
    return String(originalByName[name.trim().toLowerCase()] || 0);
  };

  const setCount = (name, value) => {
    if (value !== "" && !/^\d+$/.test(value)) return;
    setCounts((prev) => ({ ...prev, [name]: value }));
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allClients.filter((c) => {
      const logged = (originalByName[c.name.trim().toLowerCase()] || 0) > 0;
      if (onlyLogged && !logged) return false;
      if (q && !c.name.toLowerCase().includes(q) && !(c.owner || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allClients, query, onlyLogged, originalByName]);

  const save = async () => {
    const changed = allClients.filter((c) => {
      const before = originalByName[c.name.trim().toLowerCase()] || 0;
      const raw = counts[c.name];
      if (raw === undefined) return false;
      const after = parseInt(raw || "0", 10);
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
      const visit_count = parseInt(counts[c.name] || "0", 10);
      try {
        await api.setClientVisit(trainee.id, c.name, visit_count);
        saved.push({ client_name: c.name, visit_count });
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
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
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

        <div className="px-6 py-3 border-b border-neutral-100 flex flex-wrap items-center gap-2 flex-shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client or RM…"
              className="w-full text-sm border border-neutral-200 rounded-full pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
          <button
            onClick={() => setOnlyLogged((v) => !v)}
            className={`text-sm rounded-full px-3 py-1.5 border transition-colors ${
              onlyLogged
                ? "border-transparent text-white"
                : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            }`}
            style={onlyLogged ? { backgroundColor: ORANGE } : undefined}
          >
            Logged only
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-3 py-2">
          {allClients.length === 0 ? (
            <p className="text-sm text-neutral-400 px-3 py-8 text-center">
              Could not load the client sheet.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-neutral-400 px-3 py-8 text-center">
              No clients match those filters.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-50">
              {visible.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-neutral-800 block truncate">
                      {c.name}
                    </span>
                    {(c.segment || c.owner) && (
                      <span className="text-xs text-neutral-400">
                        {[c.segment, c.owner && `RM ${c.owner}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={countFor(c.name)}
                    onChange={(e) => setCount(c.name, e.target.value)}
                    className="w-16 text-sm text-right border border-neutral-200 rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200 tabular-nums flex-shrink-0"
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
            disabled={saving}
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
