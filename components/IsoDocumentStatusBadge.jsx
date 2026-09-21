const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  in_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  superseded: "bg-rose-100 text-rose-700",
};

// Renders the document's own review-status field verbatim — never rephrase
// this as a claim about compliance or safety, see components/IsoDisclaimer.jsx.
export default function IsoDocumentStatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}>
      {(status || "draft").replace("_", " ")}
    </span>
  );
}
