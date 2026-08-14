import React, { useState } from "react";
import { api } from "@/lib/api";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ORANGE = "#E05A2B";

/**
 * Edit a trainee's CSAT score. Backed by trainees.csat_score (nullable
 * numeric, 0-100) - admin-entered directly, same pattern as Remarks. No
 * external source (sheet, survey tool, etc.) wired up yet.
 *
 * Props:
 *   trainee   the trainee being edited (uses trainee.csat_score as initial value)
 *   onSaved(score)   called with the saved number (or null if cleared)
 *   onClose
 */
export default function CsatDialog({ trainee, onSaved, onClose }) {
  const [value, setValue] = useState(trainee?.csat_score != null ? String(trainee.csat_score) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const num = value.trim() === "" ? null : Number(value);
    if (num != null && (Number.isNaN(num) || num < 0 || num > 100)) {
      toast.error("Enter a score between 0 and 100");
      return;
    }
    setSaving(true);
    try {
      await api.updateTrainee(trainee.id, { csat_score: num });
      toast.success(`CSAT score updated for ${trainee.name}`);
      onSaved?.(num);
      onClose();
    } catch (e) {
      toast.error("Could not save CSAT score");
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
        data-testid="csat-dialog"
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 flex-shrink-0">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">CSAT score</p>
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
          <label className="text-xs text-neutral-500 uppercase tracking-wider">Score (%)</label>
          <input
            autoFocus
            type="number"
            min={0}
            max={100}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 85"
            data-testid="csat-input"
            className="w-full mt-1.5 text-sm border border-neutral-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
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
