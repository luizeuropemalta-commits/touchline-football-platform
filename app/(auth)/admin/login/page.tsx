import { AdminAccountAccess } from "@/components/admin-account-access";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeTouchLineAdminReturnTo,
  normalizeTouchLineAuthLocale,
} from "@/lib/touchlineArena/auth-i18n";

const loginErrors = new Set([
  "auth_callback",
  "invalid_credentials",
  "email_not_confirmed",
  "account_disabled",
  "profile_setup_failed",
  "session_cookie_failure",
  "auth_unavailable",
]);

export const dynamic = "force-dynamic";

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; error?: string; returnTo?: string }>;
}) {
  const { lang, error, returnTo } = await searchParams;
  const locale = normalizeTouchLineAuthLocale(lang);
  const adminReturnTo = normalizeTouchLineAdminReturnTo(returnTo);
  const pt = locale === "pt-BR";
  const supabase = await createClient();
  const { data: { user } } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  return (
    <AuthLayout cinematic locale={locale} showPanelHeader={false}>
      <p className="text-[9px] font-black uppercase tracking-[.2em] text-[#a3ff12]">
        {pt ? "Acesso protegido TouchLine" : "Protected TouchLine access"}
      </p>
      <h1 className="font-display mt-3 text-4xl italic">
        {pt ? "Login do Administrador" : "Administrator login"}
      </h1>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        {pt
          ? "Entre com a conta administrativa existente para gerir a Arena e as publicações internas da QA."
          : "Use your existing administrator account to manage the Arena and internal QA publications."}
      </p>
      {user ? (
        <AdminAccountAccess
          authorized={isOwnerEmail(user.email)}
          email={user.email ?? (pt ? "Conta autenticada" : "Authenticated account")}
          locale={locale}
          returnTo={adminReturnTo}
        />
      ) : (
        <AuthForm
          mode="login"
          locale={locale}
          entryPath="/admin/login"
          returnTo={adminReturnTo}
          initialError={typeof error === "string" && loginErrors.has(error)
            ? error as Parameters<typeof AuthForm>[0]["initialError"]
            : null}
        />
      )}
    </AuthLayout>
  );
}
