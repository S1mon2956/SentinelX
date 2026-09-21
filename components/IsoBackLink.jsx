import Link from "next/link";

export default function IsoBackLink({ href, children }) {
  return (
    <Link href={href} className="text-xs font-medium text-indigo-600 underline">
      &larr; {children}
    </Link>
  );
}
