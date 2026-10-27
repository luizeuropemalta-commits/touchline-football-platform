import { NextResponse } from "next/server";

import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  // CSV quoting alone does not prevent spreadsheet formulas in text fields.
  const text = typeof value === "string" && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

const privateHeaders = { "cache-control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    if (!supabase || !admin) return NextResponse.json({ error: "Financial export is unavailable." }, { status: 503, headers: privateHeaders });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) return NextResponse.json({ error: "Financial export is unavailable." }, { status: 503, headers: privateHeaders });
    if (!hasTouchLineArenaAccess(user) || !isOwnerEmail(user?.email)) {
      return NextResponse.json({ error: "Owner access required." }, { status: 403, headers: privateHeaders });
    }

    const { data, error } = await admin
      .from("billing_invoices")
      .select("number,status,currency,subtotal,tax,total,amount_paid,amount_due,period_start,period_end,paid_at,created_at,stripe_invoice_id")
      .order("created_at", { ascending: false })
      .order("stripe_invoice_id", { ascending: false })
      .limit(1000);

    if (error || !Array.isArray(data)) return NextResponse.json({ error: "Financial export is unavailable." }, { status: 503, headers: privateHeaders });

    const rows = [
      ["number", "status", "currency", "subtotal", "tax", "total", "amount_paid", "amount_due", "period_start", "period_end", "paid_at", "created_at", "stripe_invoice_id"],
      ...data.map((invoice) => [
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
        ...privateHeaders,
        "x-touchline-export-scope": "latest-1000-invoices; amounts-in-provider-minor-units",
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="touchline-finance-latest-1000-invoices-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Financial export is unavailable." }, { status: 503, headers: privateHeaders });
  }
}
