import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { loadAccountLocaleContext } from "@/lib/touchlineArena/account-locale-context-server";
import { isTouchLineSiteLocalesEnabled } from "@/lib/touchlineArena/site-locales-release";
import { ResetPasswordForm } from "@/components/reset-password-form";
import {
  getTouchLineAuthCopy,
  normalizeTouchLineAuthLocale,
  normalizeTouchLineLoginLocale,
  touchLineAuthHref,
} from "@/lib/touchlineArena/auth-i18n";

type ResetProps = { searchParams: Promise<{ lang?: string }> };

export default async function ResetPassword(props: ResetProps) {
  return renderResetPassword(props, false, isTouchLineSiteLocalesEnabled("/reset-password"));
}

async function renderResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}, draftLocalesEnabled = false, publicRelease = false) {
  const { lang } = await searchParams;
  const accountLocaleContext = await loadAccountLocaleContext();
  const locale = draftLocalesEnabled ? normalizeTouchLineLoginLocale(lang) : normalizeTouchLineAuthLocale(lang, publicRelease);
  const copy = getTouchLineAuthCopy(locale, draftLocalesEnabled || publicRelease).reset;

  return (
    <AuthLayout locale={locale} accountLocaleContext={accountLocaleContext} showArenaHomeLink={false} draftLocalesEnabled={draftLocalesEnabled} siteLocalesEnabled={publicRelease} keepLoginLayoutStable
      brandSubtitle="TouchLine Futebol Cards" minimalBrandMark
      brandWordmarkClassName="text-[clamp(26px,3.2vw,34px)]">
      <Link href={touchLineAuthHref("/login", locale, publicRelease)} className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-black text-slate-200">
        <ArrowLeft size={12} /> {copy.back}
      </Link>
      <p className="text-[9px] font-black text-cyan-300">{copy.eyebrow}</p>
      <h1 className="font-display mt-3 text-4xl italic">{copy.title}</h1>
      <p className="mt-3 text-xs leading-6 text-slate-300">{copy.description}</p>
      <ResetPasswordForm locale={locale} draftLocaleEnabled={draftLocalesEnabled} siteLocalesEnabled={publicRelease} />
    </AuthLayout>
  );
}
