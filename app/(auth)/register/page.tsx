import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";

export default function Register() { return <AuthLayout><p className="text-[9px] font-black uppercase tracking-[.2em] text-cyan-300">Create workspace</p><h1 className="font-display mt-3 text-4xl uppercase italic">Join the football network.</h1><p className="mt-3 text-xs text-slate-500">Create your secure profile and start connecting with the football market.</p><AuthForm mode="register"/><p className="mt-7 text-center text-[10px] text-slate-600">Already active? <Link href="/login" className="font-black text-cyan-300">Sign in</Link></p></AuthLayout>; }
