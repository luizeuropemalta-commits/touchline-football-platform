import Link from "next/link";
import { AlertTriangle, LockKeyhole, Settings } from "lucide-react";
import { GamePanel } from "@/components/game-ui";

export function WorkspaceState({ status, message }: { status: "missing-config" | "anonymous" | "error"; message?: string }) {
  const copy = {
    "missing-config": {
      icon: Settings,
      title: "Supabase is not connected",
      body: "Add the production Supabase URL and public anon key in Vercel to activate this real workspace page.",
      action: "Open setup guide",
      href: "/settings",
    },
    anonymous: {
      icon: LockKeyhole,
      title: "Login required",
      body: "Enter your Touchline account to load your private football operating system.",
      action: "Login",
      href: "/login",
    },
    error: {
      icon: AlertTriangle,
      title: "Workspace needs attention",
      body: message ?? "Touchline could not load your agency workspace.",
      action: "Go to dashboard",
      href: "/dashboard",
    },
  }[status];
  const Icon = copy.icon;

  return (
    <div className="mx-auto max-w-[1200px] animate-in">
      <GamePanel className="p-8">
        <span className="grid size-12 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[.07] text-cyan-300">
          <Icon size={20} />
        </span>
        <h1 className="mt-5 font-display text-3xl uppercase italic text-white">{copy.title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">{copy.body}</p>
        <Link href={copy.href} className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">
          {copy.action}
        </Link>
      </GamePanel>
    </div>
  );
}
