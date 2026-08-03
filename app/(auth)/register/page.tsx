import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import {
  getTouchLineAuthCopy,
  normalizeTouchLineAuthLocale,
  touchLineAuthEntryHref,
} from "@/lib/touchlineArena/auth-i18n";

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; returnTo?: string }>;
}) {
  const { lang, returnTo } = await searchParams;
  const locale = normalizeTouchLineAuthLocale(lang);
  const copy = getTouchLineAuthCopy(locale).register;

  return (
    <AuthLayout cinematic locale={locale}>
      <Link href={touchLineAuthEntryHref("/login", locale, returnTo)} className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[9px] font-black text-slate-300 transition hover:border-[#a3ff12]/30 hover:text-[#c5ff6d]">
        <ArrowLeft size={12} />
        {copy.back}
      </Link>
      <p className="text-[9px] font-black text-cyan-300">{copy.eyebrow}</p>
      <h1 className="font-display mt-2 text-4xl italic">{copy.title}</h1>
      <p className="mt-2 text-xs leading-5 text-slate-500">{copy.description}</p>
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/[.07] p-3 text-left shadow-[inset_0_0_22px_rgba(163,255,18,.035)]">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-[#a3ff12]/25 bg-black/30 text-[#a3ff12]">
          <FlaskConical size={17} aria-hidden="true" />
        </span>
        <span>
          <strong className="block text-[10px] font-black text-[#c5ff6d]">{copy.betaTitle}</strong>
          <span className="mt-1 block text-[10px] leading-4 text-slate-300/75">
            {copy.betaDescription}
          </span>
        </span>
      </div>
      <AuthForm mode="register" locale={locale} returnTo={returnTo} />
    </AuthLayout>
  );
}
