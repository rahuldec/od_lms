import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { X, Search, Loader2, Check, Plus } from "lucide-react";
import { toast } from "sonner";

const ORANGE = "#E05A2B";

const MODES = [
  { key: "solo", label: "Solo" },
  { key: "assisted", label: "Assisted" },
];

/**
 * Assign projects to one trainee, solo or with assistance.
 *
 * Unlike ClientAssignDialog, the project catalog has no external sheet - it
 * lives entirely in Supabase and is fetched here on open. Typing a new name
 * and hitting "Add" creates it in the catalog (idempotent on the backend),
 * so there's no separate "manage projects" screen to maintain.
 *
 * Props:
 *   trainee          the trainee being edited
 *   assigned         [{project_name, handling_mode}] currently assigned to this trainee
 *   onSaved(assignments)   called with the saved [{project_name, handling_mode}] set
 *   onClose
 */
export default function ProjectAssignDialog({ trainee, assigned = [], onSaved, onClose }) {
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState(() => new Set(assigned.map((a) => a.project_name)));
  const [modes, setModes] = useState(() =>
    Object.fromEntries(assigned.map((a) => [a.project_name, a.handling_mode || "solo"]))
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .listProjects()
      .then((rows) => setProjects(Array.isArray(rows) ? rows : []))
      .catch(() => toast.error("Could not load the project catalog"))
      .finally(() => setLoadingProjects(false));
  }, []);

  useEffect(() => {
    setSelected(new Set(assigned.map((a) => a.project_name)));
    setModes(Object.fromEntries(assigned.map((a) => [a.project_name, a.handling_mode || "solo"])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainee?.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const toggle = (name) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
        setModes((m) => (m[name] ? m : { ...m, [name]: "solo" }));
      }
      return next;
    });

  const setMode = (name, mode) => setModes((m) => ({ ...m, [name]: mode }));

  const addProject = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await api.createProject(name);
      setProjects((prev) =>
        prev.some((p) => p.name.toLowerCase() === created.name.toLowerCase())
          ? prev
          : [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      toggle(created.name);
      setNewName("");
    } catch (e) {
      toast.error("Could not add project");
    } finally {
      setCreating(false);
    }
  };

  const dirty = useMemo(() => {
    const before = new Map(assigned.map((a) => [a.project_name, a.handling_mode || "solo"]));
    if (before.size !== selected.size) return true;
    for (const n of selected) {
      if (!before.has(n) || before.get(n) !== (modes[n] || "solo")) return true;
    }
    return false;
  }, [assigned, selected, modes]);

  const save = async () => {
    setSaving(true);
    const assignments = Array.from(selected).map((project_name) => ({
      project_name,
      handling_mode: modes[project_name] || "solo",
    }));
    try {
      await api.setTraineeProjects(trainee.id, assignments);
      toast.success(
        assignments.length
          ? `${assignments.length} project${assignments.length === 1 ? "" : "s"} assigned to ${trainee.name}`
          : `Cleared all projects for ${trainee.name}`
      );
      onSaved?.(assignments);
      onClose();
    } catch (e) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      toast.error(
        status === 404
          ? "Save endpoint not found - the backend needs redeploying"
          : `Could not save: ${detail || e?.message || "unknown error"}`
      );
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
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        data-testid="project-assign-dialog"
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 flex-shrink-0">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">
              Assign projects
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

        <div className="px-6 py-3 border-b border-neutral-100 flex items-center gap-2 flex-shrink-0">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addProject()}
            placeholder="New project name…"
            className="flex-1 text-sm border border-neutral-200 rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
          <button
            onClick={addProject}
            disabled={creating || !newName.trim()}
            className="text-sm px-3 py-1.5 rounded-full text-white font-medium inline-flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
            style={{ backgroundColor: ORANGE }}
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </button>
        </div>

        <div className="px-6 py-3 border-b border-neutral-100 flex-shrink-0">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="w-full text-sm border border-neutral-200 rounded-full pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-3 py-2">
          {loadingProjects ? (
            <p className="text-sm text-neutral-400 px-3 py-8 text-center">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-neutral-400 px-3 py-8 text-center">
              {projects.length === 0 ? "No projects yet - add one above." : "No projects match that search."}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-50">
              {visible.map((p) => {
                const isOn = selected.has(p.name);
                const mode = modes[p.name] || "solo";
                return (
                  <li key={p.id}>
                    <div className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-50 rounded-lg transition-colors">
                      <button
                        onClick={() => toggle(p.name)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
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
                        <span className="text-sm font-medium text-neutral-800 truncate">
                          {p.name}
                        </span>
                      </button>
                      {isOn && (
                        <div className="flex-shrink-0 inline-flex rounded-full border border-neutral-200 p-0.5">
                          {MODES.map((m) => (
                            <button
                              key={m.key}
                              onClick={() => setMode(p.name, m.key)}
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                                mode === m.key ? "text-white" : "text-neutral-500 hover:text-neutral-700"
                              }`}
                              style={mode === m.key ? { backgroundColor: ORANGE } : undefined}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
