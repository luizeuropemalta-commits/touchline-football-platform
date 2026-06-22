import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";

export default function Login() { return <AuthLayout><p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">Career access</p><h1 className="font-display mt-3 text-4xl uppercase italic">Enter Touchline</h1><p className="mt-3 text-xs text-slate-500">Your football command center is ready.</p><AuthForm mode="login"/><p className="mt-7 text-center text-[10px] text-slate-600">New agent? <Link href="/register" className="font-black text-cyan-300">Start your career</Link></p></AuthLayout>; }
