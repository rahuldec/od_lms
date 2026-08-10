import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { clientFacets } from "@/lib/clients";
import { Badge } from "@/components/ui/badge";
import { X, Search, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

const ORANGE = "#E05A2B";

const FILTERS = [
  { key: "segment", label: "All segments" },
  { key: "category", label: "All sizes" },
  { key: "owner", label: "All RMs" },
];

/**
 * Assign clients to one trainee.
 *
 * Deliberately edits the whole set and saves it in a single call rather than
 * one request per checkbox - the backend endpoint replaces the set atomically,
 * so a half-finished edit can't leave the trainee with a partial book if the
 * admin closes the tab mid-way.
 *
 * Props:
 *   trainee          the trainee being edited
 *   clients          full client list from the sheet
 *   assignedNames    client names currently assigned to this trainee
 *   ownersByClient   { [clientNameLower]: [traineeName] } - other trainees who
 *                    already hold a client, shown so double-booking is a
 *                    visible choice rather than an accident
 *   onSaved(names)   called with the saved set
 *   onClose
 */
export default function ClientAssignDialog({
  trainee,
  clients,
  assignedNames = [],
  ownersByClient = {},
  onSaved,
  onClose,
}) {
  const [selected, setSelected] = useState(() => new Set(assignedNames));
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ segment: "", category: "", owner: "" });
  const [onlySelected, setOnlySelected] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(new Set(assignedNames));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainee?.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const facets = useMemo(() => clientFacets(clients), [clients]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (onlySelected && !selected.has(c.name)) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.owner.toLowerCase().includes(q))
        return false;
      return FILTERS.every(({ key }) => !filters[key] || c[key] === filters[key]);
    });
  }, [clients, query, filters, onlySelected, selected]);

  const toggle = (name) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const dirty = useMemo(() => {
    const before = new Set(assignedNames);
    if (before.size !== selected.size) return true;
    for (const n of selected) if (!before.has(n)) return true;
    return false;
  }, [assignedNames, selected]);

  const save = async () => {
    setSaving(true);
    const names = Array.from(selected);
    try {
      await api.setTraineeClients(trainee.id, names);
      toast.success(
        names.length
          ? `${names.length} client${names.length === 1 ? "" : "s"} assigned to ${trainee.name}`
          : `Cleared all clients for ${trainee.name}`
      );
      onSaved?.(names);
      onClose();
    } catch (e) {
      toast.error("Could not save client assignment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        data-testid="client-assign-dialog"
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 flex-shrink-0">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">
              Assign clients
            </p>
            <p className="font-semibold text-lg">{trainee?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums text-neutral-500">
              {selected.size} selected
            </span>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full hover:bg-neutral-100 grid place-items-center"
            >
              <X className="h-4 w-4 text-neutral-500" />
            </button>
          </div>
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
          {FILTERS.map(({ key, label }) => (
            <select
              key={key}
              value={filters[key]}
              onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
              className="text-sm border border-neutral-200 rounded-full px-3 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-orange-200"
            >
              <option value="">{label}</option>
              {(facets[key] || []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ))}
          <button
            onClick={() => setOnlySelected((v) => !v)}
            className={`text-sm rounded-full px-3 py-1.5 border transition-colors ${
              onlySelected
                ? "border-transparent text-white"
                : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            }`}
            style={onlySelected ? { backgroundColor: ORANGE } : undefined}
          >
            Selected only
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-3 py-2">
          {visible.length === 0 ? (
            <p className="text-sm text-neutral-400 px-3 py-8 text-center">
              No clients match those filters.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-50">
              {visible.map((c) => {
                const isOn = selected.has(c.name);
                const others = (ownersByClient[c.id] || []).filter(
                  (n) => n !== trainee?.name
                );
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => toggle(c.name)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-50 rounded-lg text-left transition-colors"
                    >
                      <span
                        className="h-4 w-4 rounded border grid place-items-center flex-shrink-0"
                        style={
                          isOn
                            ? { backgroundColor: ORANGE, borderColor: ORANGE }
                            : { borderColor: "#d4d4d4" }
                        }
                      >
                        {isOn && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-neutral-800 block truncate">
                          {c.name}
                        </span>
                        <span className="text-xs text-neutral-400">
                          {[c.segment, c.category, c.owner && `RM ${c.owner}`]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </span>
                      </span>
                      {others.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="rounded-full text-[10px] font-medium flex-shrink-0 bg-blue-50 text-blue-600"
                        >
                          also {others.join(", ")}
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0}
            className="text-sm text-neutral-500 hover:text-neutral-800 disabled:opacity-40"
          >
            Clear all
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-full border border-neutral-200 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="text-sm px-5 py-2 rounded-full text-white font-medium inline-flex items-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: ORANGE }}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
