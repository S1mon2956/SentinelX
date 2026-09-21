// Single source of truth for which client-facing ISO sections have a real
// page built. A section here is both labeled and linkable on a restricted
// user's landing page; a section not here still exists (it's a real,
// grantable iso_membership_scopes value) but renders as "Coming soon"
// until its route ships — add it here the same day its page ships, not
// separately in AppNav/landing-page logic.
export const ISO_SECTION_LABELS = {
  documents: "Documents",
  audits: "Audits",
  actions: "Actions",
  risks: "Risks",
  contractors: "Contractors",
  equipment: "Equipment",
  meetings: "Meetings",
  reports: "Audit Reports",
};

export const ISO_SECTION_ROUTES = {
  documents: (orgId) => `/iso/${orgId}/standards`,
};
