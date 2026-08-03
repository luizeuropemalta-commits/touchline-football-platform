import { NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const { data, error } = await admin
    .from("billing_invoices")
    .select("number,status,currency,subtotal,tax,total,amount_paid,amount_due,period_start,period_end,paid_at,created_at,stripe_invoice_id")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = [
    ["number", "status", "currency", "subtotal", "tax", "total", "amount_paid", "amount_due", "period_start", "period_end", "paid_at", "created_at", "stripe_invoice_id"],
    ...(data ?? []).map((invoice) => [
      invoice.number,
      invoice.status,
      invoice.currency,
      invoice.subtotal,
      invoice.tax,
      invoice.total,
      invoice.amount_paid,
      invoice.amount_due,
      invoice.period_start,
      invoice.period_end,
      invoice.paid_at,
      invoice.created_at,
      invoice.stripe_invoice_id,
    ]),
  ];

  return new NextResponse(rows.map((row) => row.map(csvCell).join(",")).join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="premier-touchline-finance-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
