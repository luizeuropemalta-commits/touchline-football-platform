import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { getTouchLineLoginCopy, normalizeTouchLineLoginLocale, normalizeTouchLineAuthLocale, normalizeTouchLineAuthReturnTo, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";

const loginErrors = new Set([
  "auth_callback",
  "invalid_credentials",
  "email_not_confirmed",
  "account_disabled",
  "profile_setup_failed",
  "session_cookie_failure",
  "auth_unavailable",
]);

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; error?: string; returnTo?: string }>;
}) {
  const { lang, error, returnTo } = await searchParams;
  const returnPath = normalizeTouchLineAuthReturnTo(returnTo)?.split(/[?#]/)[0] ?? "";
  const protectedReturn = ["/admin", "/visual-qa"].some(path => returnPath === path || returnPath.startsWith(`${path}/`));
  const siteLocalesEnabled = isTouchLineSiteLocalesEnabled("/login") && !protectedReturn;
  const locale = protectedReturn ? normalizeTouchLineAuthLocale(lang) : normalizeTouchLineLoginLocale(lang);
  const copy = getTouchLineLoginCopy(locale).login;

  return (
    <AuthLayout
      cinematic
      locale={locale}
      draftLocalesEnabled={!protectedReturn}
      siteLocalesEnabled={siteLocalesEnabled}
      showArenaHomeLink={false}
      brandHref={touchLineAuthHref("/login", locale, siteLocalesEnabled)}
      brandSubtitle="TouchLine Futebol Cards"
      brandWordmarkClassName="text-[clamp(26px,3.2vw,34px)]"
      minimalBrandMark
      keepLoginLayoutStable
    >
      <p className="text-[9px] font-black text-cyan-300">{copy.eyebrow}</p>
      <h1 className="font-display mt-3 text-4xl italic">{copy.title}</h1>
      <p className="mt-3 text-sm font-medium leading-6 text-slate-200">{copy.description}</p>
      <AuthForm
        mode="login"
        locale={locale}
        draftLocaleEnabled={!protectedReturn}
        siteLocalesEnabled={siteLocalesEnabled}
        returnTo={returnTo}
        initialError={typeof error === "string" && loginErrors.has(error) ? error as Parameters<typeof AuthForm>[0]["initialError"] : null}
      />
    </AuthLayout>
  );
}
