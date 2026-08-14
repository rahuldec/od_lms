import React, { useState } from "react";
import { api } from "@/lib/api";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ORANGE = "#E05A2B";

export const CARD_OPTIONS = [
  { key: "clients", label: "Clients" },
  { key: "projects", label: "Projects" },
  { key: "sprints", label: "Sprints" },
  { key: "visits", label: "Visits" },
  { key: "csat", label: "CSAT score" },
];

/**
 * Pick which optional sections show on this trainee's dashboard card.
 * Backed by trainees.enabled_cards (nullable jsonb array of the keys
 * above). Null/missing means "everything on" - existing trainees don't
 * lose sections the moment this ships; saving here always writes an
 * explicit array from that point on.
 *
 * Props:
 *   trainee   the trainee being edited
 *   onSaved(enabled_cards)   called with the saved array
 *   onClose
 */
export default function CardSettingsDialog({ trainee, onSaved, onClose }) {
  const allKeys = CARD_OPTIONS.map((o) => o.key);
  const initial = Array.isArray(trainee?.enabled_cards) ? trainee.enabled_cards : allKeys;
  const [selected, setSelected] = useState(new Set(initial));
  const [saving, setSaving] = useState(false);

  // Sprints is a QA-team concept - CS trainees never see it regardless of
  // this setting, so there's nothing to toggle for them here.
  const visibleOptions = CARD_OPTIONS.filter(
    (o) => o.key !== "sprints" || trainee?.department !== "CS"
  );

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    const enabled_cards = [...selected];
    setSaving(true);
    try {
      await api.updateTrainee(trainee.id, { enabled_cards });
      toast.success(`Card settings updated for ${trainee.name}`);
      onSaved?.(enabled_cards);
      onClose();
    } catch (e) {
      toast.error("Could not save card settings");
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
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="card-settings-dialog"
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 flex-shrink-0">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Card settings</p>
            <p className="font-semibold text-lg">{trainee?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-neutral-100 grid place-items-center"
          >
            <X className="h-4 w-4 text-neutral-500" />
          </button>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-neutral-500 mb-3">
            Choose which sections show on {trainee?.name?.split(" ")[0]}'s dashboard card.
            Unchecked sections are hidden entirely, not just shown empty.
          </p>
          <div className="flex flex-col gap-2">
            {visibleOptions.map((o) => (
              <label
                key={o.key}
                className="flex items-center gap-2.5 text-sm px-3 py-2 rounded-xl border border-neutral-200 hover:bg-neutral-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(o.key)}
                  onChange={() => toggle(o.key)}
                  className="h-4 w-4 rounded border-neutral-300"
                  style={{ accentColor: ORANGE }}
                />
                {o.label}
              </label>
            ))}
          </div>
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
