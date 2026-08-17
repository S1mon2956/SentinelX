export const ANSWER_TYPES = [
  { value: "pass_fail_na", label: "Pass / Fail / N-A" },
  { value: "rating", label: "Rating (1-5)" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "free_text", label: "Free text" },
];

export const FAILURE_WORKFLOWS = [
  { value: "none", label: "No action — just flag it" },
  { value: "assign_action", label: "Assign to someone with a due date" },
  { value: "requires_signoff", label: "Requires sign-off before closing" },
];

// Palette for multiple-choice options — the customer picks one of these per
// choice in the template builder. Kept to a small fixed set (rather than a
// free color picker) so buttons stay legible and consistent app-wide.
export const OPTION_COLORS = [
  { value: "slate", label: "Grey", swatch: "bg-slate-400", selected: "bg-slate-700 border-slate-700" },
  { value: "emerald", label: "Green", swatch: "bg-emerald-500", selected: "bg-emerald-600 border-emerald-600" },
  { value: "rose", label: "Red", swatch: "bg-rose-500", selected: "bg-rose-600 border-rose-600" },
  { value: "amber", label: "Amber", swatch: "bg-amber-500", selected: "bg-amber-500 border-amber-500" },
  { value: "blue", label: "Blue", swatch: "bg-blue-500", selected: "bg-blue-600 border-blue-600" },
];

export function optionColor(value) {
  return OPTION_COLORS.find((c) => c.value === value) || OPTION_COLORS[0];
}

// Every multiple-choice item implicitly gets a grey "N/A" choice — it isn't
// stored on the template, so the builder never asks for it and it can't be
// recolored away from grey.
export const NA_OPTION = { label: "N/A", color: "slate" };
