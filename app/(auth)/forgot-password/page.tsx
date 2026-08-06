import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import {
  getTouchLineAuthCopy,
  normalizeTouchLineAuthLocale,
  touchLineAuthEntryHref,
} from "@/lib/touchlineArena/auth-i18n";

export default async function Forgot({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; returnTo?: string }>;
}) {
  const { lang, returnTo } = await searchParams;
  const locale = normalizeTouchLineAuthLocale(lang);
  const copy = getTouchLineAuthCopy(locale).forgot;

  return (
    <AuthLayout locale={locale}>
      <Link href={touchLineAuthEntryHref("/login", locale, returnTo)} className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-[9px] font-black text-slate-600">
        <ArrowLeft size={12} /> {copy.back}
      </Link>
      <p className="text-[9px] font-black text-cyan-300">{copy.eyebrow}</p>
      <h1 className="font-display mt-3 text-4xl italic">{copy.title}</h1>
      <p className="mt-3 text-xs leading-6 text-slate-500">{copy.description}</p>
      <AuthForm mode="forgot" locale={locale} returnTo={returnTo} />
    </AuthLayout>
  );
}
