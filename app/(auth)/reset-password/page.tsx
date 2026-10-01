import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { ResetPasswordForm } from "@/components/reset-password-form";
import {
  getTouchLineAuthCopy,
  normalizeTouchLineAuthLocale,
  touchLineAuthHref,
} from "@/lib/touchlineArena/auth-i18n";

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale = normalizeTouchLineAuthLocale(lang);
  const copy = getTouchLineAuthCopy(locale).reset;

  return (
    <AuthLayout locale={locale}>
      <Link href={touchLineAuthHref("/login", locale)} className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-black text-slate-200">
        <ArrowLeft size={12} /> {copy.back}
      </Link>
      <p className="text-[9px] font-black text-cyan-300">{copy.eyebrow}</p>
      <h1 className="font-display mt-3 text-4xl italic">{copy.title}</h1>
      <p className="mt-3 text-xs leading-6 text-slate-300">{copy.description}</p>
      <ResetPasswordForm locale={locale} />
    </AuthLayout>
  );
}
