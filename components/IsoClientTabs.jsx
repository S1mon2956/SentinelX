"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const RISKS_HREF = (orgId) => `/admin/iso/organizations/${orgId}/risks`;

// Hazards has no route of its own — it's the risks page filtered to
// category=Hazard, so its active-state has to check the query string too,
// otherwise both "Risks" and "Hazards" would highlight together.
const TABS = [
  { key: "documents", label: "Documents", href: (orgId) => `/admin/iso/organizations/${orgId}` },
  { key: "audits", label: "Audits", href: (orgId) => `/admin/iso/organizations/${orgId}/audits` },
  { key: "actions", label: "Actions", href: (orgId) => `/admin/iso/organizations/${orgId}/actions` },
  {
    key: "risks",
    label: "Risks",
    href: RISKS_HREF,
    isActive: (pathname, searchParams, orgId) => pathname === RISKS_HREF(orgId) && searchParams.get("category") !== "Hazard",
  },
  {
    key: "hazards",
    label: "Hazards",
    href: (orgId) => `${RISKS_HREF(orgId)}?category=Hazard`,
    isActive: (pathname, searchParams, orgId) => pathname === RISKS_HREF(orgId) && searchParams.get("category") === "Hazard",
  },
  { key: "contractors", label: "Contractors", href: (orgId) => `/admin/iso/organizations/${orgId}/contractors` },
  { key: "equipment", label: "Equipment", href: (orgId) => `/admin/iso/organizations/${orgId}/equipment` },
  { key: "meetings", label: "Meetings", href: (orgId) => `/admin/iso/organizations/${orgId}/meetings` },
  { key: "reports", label: "Reports", href: (orgId) => `/admin/iso/organizations/${orgId}/reports` },
];

export default function IsoClientTabs({ orgId }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <nav className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
      {TABS.map((t) => {
        const href = t.href(orgId);
        const active = t.isActive ? t.isActive(pathname, searchParams, orgId) : pathname === href;
        return (
          <Link
            key={t.key}
            href={href}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
              active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
