import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { loadAccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import {
  getTouchLineAuthCopy,
  normalizeTouchLineAuthLocale,
  normalizeTouchLineLoginLocale,
  normalizeTouchLineAuthReturnTo,
  touchLineAuthEntryHref,
} from "@/lib/touchlineArena/auth-i18n";

type ForgotProps = { searchParams: Promise<{ lang?: string; returnTo?: string }> };

export default async function Forgot(props: ForgotProps) {
  return renderForgot(props, false, isTouchLineSiteLocalesEnabled("/forgot-password"));
}

async function renderForgot({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; returnTo?: string }>;
}, draftLocalesEnabled = false, publicRelease = false) {
  const { lang, returnTo } = await searchParams;
  const returnPath = normalizeTouchLineAuthReturnTo(returnTo)?.split(/[?#]/)[0] ?? "";
  const siteLocalesEnabled = publicRelease && !["/admin", "/visual-qa"].some(path => returnPath === path || returnPath.startsWith(`${path}/`));
  const accountLocaleContext = await loadAccountLocaleContext();
  const locale = draftLocalesEnabled ? normalizeTouchLineLoginLocale(lang) : normalizeTouchLineAuthLocale(lang, siteLocalesEnabled);
  const copy = getTouchLineAuthCopy(locale, draftLocalesEnabled || siteLocalesEnabled).forgot;

  return (
    <AuthLayout locale={locale} accountLocaleContext={accountLocaleContext} showArenaHomeLink={false} draftLocalesEnabled={draftLocalesEnabled} siteLocalesEnabled={siteLocalesEnabled} keepLoginLayoutStable
      brandSubtitle="TouchLine Futebol Cards" minimalBrandMark
      brandWordmarkClassName="text-[clamp(26px,3.2vw,34px)]">
      <Link href={touchLineAuthEntryHref("/login", locale, returnTo, siteLocalesEnabled)} className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-black text-slate-200">
        <ArrowLeft size={12} /> {copy.back}
      </Link>
      <p className="text-[9px] font-black text-cyan-300">{copy.eyebrow}</p>
      <h1 className="font-display mt-3 text-4xl italic">{copy.title}</h1>
      <p className="mt-3 text-xs leading-6 text-slate-300">{copy.description}</p>
      <AuthForm mode="forgot" locale={locale} returnTo={returnTo} draftLocaleEnabled={draftLocalesEnabled} siteLocalesEnabled={siteLocalesEnabled} />
    </AuthLayout>
  );
}
