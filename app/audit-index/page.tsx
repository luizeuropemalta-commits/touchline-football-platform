import { notFound } from "next/navigation";
import { hasTouchlineAuditToken, isTouchlineAuditExpired, isTouchlineAuditMode } from "@/lib/touchlineAudit/access";
import { TouchlineAuditStudio } from "@/components/touchline/audit/TouchlineAuditStudio";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "TouchLine Audit Mode" };

export default async function TouchlineAuditIndex({ searchParams }: { searchParams: Promise<{ auditToken?: string | string[] }> }) {
  const { auditToken: requestedToken } = await searchParams;
  const auditToken = typeof requestedToken === "string" ? requestedToken : null;
  // This page must remain closed even when a request bypasses the proxy.
  if (!auditToken || !isTouchlineAuditMode() || isTouchlineAuditExpired() || !hasTouchlineAuditToken(auditToken)) notFound();
  return <TouchlineAuditStudio auditToken={auditToken} />;
}
