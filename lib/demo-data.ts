import type { Player } from "./types";

export const players: Player[] = [
  { id: "marcus-rashford", name: "Marcus Rashford", initials: "MR", position: "LW", club: "Aston Villa", age: 28, nationality: "ENG", status: "Active", marketValue: 48000000, contractUntil: "730 DAYS", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=500&q=85", appearances: 32, goals: 14, assists: 9, documents: 18, overall: 86, potential: 87, form: 91, relationship: 94, interest: 88, growth: 3 },
  { id: "enzo-martinez", name: "Enzo Martínez", initials: "EM", position: "CM", club: "Real Sociedad", age: 22, nationality: "ARG", status: "Active", marketValue: 32000000, contractUntil: "368 DAYS", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=85", appearances: 28, goals: 6, assists: 12, documents: 11, overall: 82, potential: 91, form: 88, relationship: 86, interest: 96, growth: 8 },
  { id: "noah-williams", name: "Noah Williams", initials: "NW", position: "CB", club: "Brighton", age: 24, nationality: "WAL", status: "Active", marketValue: 26000000, contractUntil: "24 DAYS", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=85", appearances: 26, goals: 2, assists: 1, documents: 15, overall: 81, potential: 87, form: 84, relationship: 78, interest: 72, growth: 5 },
  { id: "luca-bianchi", name: "Luca Bianchi", initials: "LB", position: "ST", club: "Atalanta", age: 20, nationality: "ITA", status: "Scouting", marketValue: 18000000, contractUntil: "1,095 DAYS", avatar: "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=500&q=85", appearances: 21, goals: 11, assists: 4, documents: 7, overall: 78, potential: 93, form: 93, relationship: 61, interest: 91, growth: 12 },
  { id: "theo-dubois", name: "Théo Dubois", initials: "TD", position: "RB", club: "LOSC Lille", age: 23, nationality: "FRA", status: "Injured", marketValue: 22000000, contractUntil: "401 DAYS", avatar: "https://images.unsplash.com/photo-1507591064344-4c6ce005b128?auto=format&fit=crop&w=500&q=85", appearances: 19, goals: 1, assists: 7, documents: 9, overall: 80, potential: 86, form: 68, relationship: 89, interest: 55, growth: 4 },
];

export const activities = [
  { title: "Deal moved to negotiation", detail: "Enzo Martínez · Real Sociedad", time: "12 min ago", color: "bg-[#c7f36b]" },
  { title: "Medical report uploaded", detail: "Théo Dubois", time: "48 min ago", color: "bg-sky-300" },
  { title: "Player profile updated", detail: "Noah Williams", time: "2 hrs ago", color: "bg-violet-300" },
  { title: "Invoice marked overdue", detail: "INV-2026-018 · €24,500", time: "4 hrs ago", color: "bg-rose-300" },
];
