"use client";
import { Button } from "@/components/ui";
export default function StudioError({ reset }: { reset: () => void }) { return <section className="glass space-y-4 rounded-3xl p-8"><h1 className="text-2xl font-bold text-white">Studio indisponível</h1><p role="alert" className="text-slate-300">Não foi possível carregar o catálogo protegido. Nenhuma aprovação ou publicação foi confirmada por esta tela.</p><Button onClick={reset}>Tentar carregar novamente</Button></section>; }
