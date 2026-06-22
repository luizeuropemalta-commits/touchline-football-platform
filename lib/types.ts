export type PlayerStatus = "Active" | "Scouting" | "Injured" | "Inactive";

export interface Player {
  id: string;
  name: string;
  initials: string;
  position: string;
  club: string;
  age: number;
  nationality: string;
  status: PlayerStatus;
  marketValue: number;
  contractUntil: string;
  avatar?: string;
  appearances: number;
  goals: number;
  assists: number;
  documents: number;
  overall: number;
  potential: number;
  form: number;
  relationship: number;
  interest: number;
  growth: number;
}
