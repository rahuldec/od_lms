import React, { useState } from "react";
import { api } from "@/lib/api";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ORANGE = "#E05A2B";

/**
 * Edit a trainee's general remarks. Backed by trainees.notes, which already
 * existed in the schema and had a PUT endpoint (used by the Trainees add/
 * edit form) - this just surfaces it on the dashboard card too.
 *
 * Props:
 *   trainee   the trainee being edited (uses trainee.notes as the initial value)
 *   onSaved(notes)   called with the saved text
 *   onClose
 */
export default function RemarksDialog({ trainee, onSaved, onClose }) {
  const [value, setValue] = useState(trainee?.notes || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateTrainee(trainee.id, { notes: value });
      toast.success(`Remarks updated for ${trainee.name}`);
      onSaved?.(value);
      onClose();
    } catch (e) {
      toast.error("Could not save remarks");
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
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="remarks-dialog"
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 flex-shrink-0">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Remarks</p>
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
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="General notes about this trainee…"
            rows={6}
            className="w-full text-sm border border-neutral-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-y"
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
            disabled={saving || value === (trainee?.notes || "")}
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
