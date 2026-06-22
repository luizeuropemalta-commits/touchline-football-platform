"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "./ui";

type Mode = "login" | "register" | "forgot";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMessage("");
    const supabase = createClient();
    if (!supabase) {
      await new Promise(r=>setTimeout(r,650));
      if (mode === "forgot") setMessage("Reset instructions sent. Check your inbox.");
      else router.push("/dashboard");
      setLoading(false); return;
    }
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard"); router.refresh();
      } else if (mode === "register") {
        const { error } = await supabase.auth.signUp({ email, password, options:{ data:{ full_name:name } } });
        if (error) throw error;
        setMessage("Account created. Check your email to confirm.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo:`${location.origin}/auth/callback?next=/settings` });
        if (error) throw error;
        setMessage("Reset instructions sent. Check your inbox.");
      }
    } catch (err) { setMessage(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setLoading(false); }
  }

  async function googleLogin() {
    setMessage("");
    const supabase = createClient();
    if (!supabase) { router.push("/dashboard"); return; }
    const { error } = await supabase.auth.signInWithOAuth({ provider:"google", options:{ redirectTo:`${location.origin}/auth/callback?next=/dashboard` } });
    if (error) setMessage(error.message);
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      {mode === "register" && <label className="block"><span className="mb-2 block text-xs font-semibold">Full name</span><Input required value={name} onChange={e=>setName(e.target.value)} placeholder="Alex Oliveira" autoComplete="name"/></label>}
      <label className="block"><span className="mb-2 block text-xs font-semibold">Work email</span><Input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@agency.com" autoComplete="email"/></label>
      {mode !== "forgot" && <label className="block"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold">Password</span>{mode==="login"&&<Link href="/forgot-password" className="text-[11px] font-semibold text-[#315c52]">Forgot password?</Link>}</div><div className="relative"><Input required minLength={8} type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={mode==="login"?"current-password":"new-password"} className="pr-11"/><button type="button" onClick={()=>setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b9592]">{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>}
      {mode === "register" && <label className="flex items-start gap-2 pt-1 text-[11px] leading-5 text-[#73807c]"><input required type="checkbox" className="mt-1 accent-[#153f36]"/>I agree to the Terms of Service and Privacy Policy.</label>}
      {message && <div className={`rounded-xl px-4 py-3 text-xs ${message.toLowerCase().includes("sent")||message.includes("created")?"bg-[#e7f4df] text-[#2a633b]":"bg-[#fee8e4] text-[#a5463a]"}`}>{message}</div>}
      <Button type="submit" disabled={loading} className="w-full">{loading?<Loader2 size={16} className="animate-spin"/>:<>{mode==="login"?"Sign in":mode==="register"?"Create account":"Send reset link"}<ArrowRight size={15}/></>}</Button>
      {mode !== "forgot" && googleEnabled && <><div className="flex items-center gap-3 py-1"><span className="h-px flex-1 bg-[#e3e7e4]"/><span className="text-[10px] uppercase tracking-wider text-[#98a19e]">or continue with</span><span className="h-px flex-1 bg-[#e3e7e4]"/></div><Button type="button" variant="secondary" onClick={googleLogin} className="w-full"><span className="text-base font-bold text-[#4285F4]">G</span> Google</Button></>}
    </form>
  );
}
