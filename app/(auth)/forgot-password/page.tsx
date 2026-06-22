import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";

export default function Forgot() { return <AuthLayout><Link href="/login" className="mb-8 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-600"><ArrowLeft size={12}/> Back to access</Link><p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">Account recovery</p><h1 className="font-display mt-3 text-4xl uppercase italic">Recover your career.</h1><p className="mt-3 text-xs leading-6 text-slate-500">Enter your work email and we&apos;ll send a secure reset link.</p><AuthForm mode="forgot"/></AuthLayout>; }
