import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Button({ className, children, variant = "primary", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button type={type} className={cn("relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 text-xs font-extrabold uppercase tracking-[.09em] transition duration-300 before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/24 before:to-transparent before:transition-transform before:duration-700 hover:before:translate-x-full active:scale-[.96] disabled:opacity-50 disabled:hover:before:-translate-x-full", variant === "primary" && "border border-[#a3ff12]/45 bg-[#a3ff12] text-[#071007] shadow-[0_0_28px_rgba(163,255,18,.18),inset_0_1px_0_rgba(255,255,255,.34)] hover:-translate-y-0.5 hover:bg-[#bcff52] hover:shadow-[0_0_38px_rgba(163,255,18,.3)]", variant === "secondary" && "border border-cyan-200/18 bg-white/[.055] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-white/[.085]", variant === "ghost" && "text-slate-400 hover:bg-white/5 hover:text-white", className)} {...props}><span className="relative z-10 contents">{children}</span></button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("console-chip h-12 w-full rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45 focus:ring-4 focus:ring-cyan-400/[.07]", className)} {...props} />;
}

export function Badge({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "amber" | "rose" | "gray" }) {
  const tones = { green:"border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#b8ff4d]", amber:"border-amber-300/25 bg-amber-300/10 text-amber-300", rose:"border-rose-400/25 bg-rose-400/10 text-rose-300", gray:"border-slate-300/15 bg-white/5 text-slate-400" };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.12em]", tones[tone])}>{children}</span>;
}
