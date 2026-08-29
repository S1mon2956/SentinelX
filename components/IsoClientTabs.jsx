"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "documents", label: "Documents", href: (orgId) => `/admin/iso/organizations/${orgId}` },
  { key: "audits", label: "Audits", href: (orgId) => `/admin/iso/organizations/${orgId}/audits` },
  { key: "actions", label: "Actions", href: (orgId) => `/admin/iso/organizations/${orgId}/actions` },
  { key: "risks", label: "Risks", href: (orgId) => `/admin/iso/organizations/${orgId}/risks` },
  { key: "contractors", label: "Contractors", href: (orgId) => `/admin/iso/organizations/${orgId}/contractors` },
];

export default function IsoClientTabs({ orgId }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
      {TABS.map((t) => {
        const href = t.href(orgId);
        const active = pathname === href;
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
