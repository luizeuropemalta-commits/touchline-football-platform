import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { getTouchLineAuthCopy, normalizeTouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; error?: string; returnTo?: string }>;
}) {
  const { lang, error, returnTo } = await searchParams;
  const locale = normalizeTouchLineAuthLocale(lang);
  const copy = getTouchLineAuthCopy(locale).login;

  return (
    <AuthLayout cinematic locale={locale}>
      <p className="text-[9px] font-black text-cyan-300">{copy.eyebrow}</p>
      <h1 className="font-display mt-3 text-4xl italic">{copy.title}</h1>
      <p className="mt-3 text-xs text-slate-500">{copy.description}</p>
      <AuthForm
        mode="login"
        locale={locale}
        returnTo={returnTo}
        initialError={
          error === "auth_callback" || error === "invalid_credentials" || error === "arena_access_unavailable" || error === "auth_unavailable"
            ? error
            : null
        }
      />
    </AuthLayout>
  );
}
