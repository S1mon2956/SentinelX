// Postgres 23514 (check_violation) is what the enforce_iso_document_clause_scope
// trigger raises when a document gets tagged to a clause that isn't
// is_active for the org — should only ever happen if the UI let someone
// pick a clause it shouldn't have offered. Defensive only.
export function describeClauseTagError(error) {
  if (error?.code === "23514") return "This clause isn't enrolled for this organization.";
  return error?.message || "Something went wrong.";
}
