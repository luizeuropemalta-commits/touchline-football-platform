export type TouchlineAuditRoute = {
  id: string;
  group: string;
  title: string;
  description: string;
};

/**
 * Sanitised route catalogue for the temporary audit mirror.  These are demo
 * renderings only; none of the paths points to a production application route.
 */
export const TOUCHLINE_AUDIT_ROUTES: readonly TouchlineAuditRoute[] = [
  { id: "public/home", group: "Público e autenticação", title: "Home / Landing", description: "Entrada pública e proposta de valor." },
  { id: "public/login", group: "Público e autenticação", title: "Login", description: "Tela visual de autenticação, sem formulário ativo." },
  { id: "public/register", group: "Público e autenticação", title: "Register", description: "Cadastro demonstrativo, sem criação de usuário." },
  { id: "public/forgot-password", group: "Público e autenticação", title: "Forgot Password", description: "Recuperação visual, sem envio de e-mail." },
  { id: "public/reset-password", group: "Público e autenticação", title: "Reset Password", description: "Redefinição visual, sem alteração de senha." },
  { id: "public/error", group: "Público e autenticação", title: "Error state", description: "Estado de falha demonstrativo." },
  { id: "public/404", group: "Público e autenticação", title: "404", description: "Página não encontrada." },
  { id: "public/maintenance", group: "Público e autenticação", title: "Maintenance", description: "Estado de manutenção." },
  { id: "onboarding/new-user", group: "Onboarding", title: "New user", description: "Identidade de clube ainda não iniciada." },
  { id: "onboarding/club-identity", group: "Onboarding", title: "Club identity", description: "Criação visual da identidade do clube." },
  { id: "onboarding/choose-coach", group: "Onboarding", title: "Choose Your Coach", description: "Coach-first: escolha obrigatória de treinador." },
  { id: "onboarding/coach-selected", group: "Onboarding", title: "Coach selected", description: "Treinador escolhido, antes de jogadores." },
  { id: "onboarding/squad-empty", group: "Onboarding", title: "Squad Builder empty", description: "Elenco vazio." },
  { id: "onboarding/squad-partial", group: "Onboarding", title: "Squad Builder partial", description: "Elenco parcial." },
  { id: "onboarding/squad-complete", group: "Onboarding", title: "Squad Builder complete", description: "Elenco completo." },
  { id: "onboarding/club-confirmation", group: "Onboarding", title: "Club confirmation", description: "Confirmação visual do clube." },
  { id: "cards/tier-gallery", group: "Cards e economia", title: "Seven tiers & frames", description: "Sete tiers, molduras e preços nominais." },
  { id: "cards/player", group: "Cards e economia", title: "Player card", description: "Card de jogador demonstrativo." },
  { id: "cards/coach", group: "Cards e economia", title: "Coach card", description: "Card de treinador demonstrativo." },
  { id: "cards/states", group: "Cards e economia", title: "Card states", description: "Selecionado, indisponível, contratado, expirado e renovação." },
  { id: "club-owner/hub", group: "ClubOwner", title: "Club Hub", description: "Hub, centro de treinamento e titulares." },
  { id: "club-owner/training", group: "ClubOwner", title: "Training Center", description: "Titulares, reservas e treinador." },
  { id: "club-owner/history", group: "ClubOwner", title: "History", description: "Histórico demonstrativo." },
  { id: "club-owner/renewals", group: "ClubOwner", title: "Renewals", description: "Renovações em modo somente leitura." },
  { id: "club-owner/substitutions", group: "ClubOwner", title: "Substitutions", description: "Substituições em modo somente leitura." },
  { id: "club-owner/frozen", group: "ClubOwner", title: "Frozen / maintenance", description: "Clube congelado e manutenção vencida." },
  { id: "arena/intro", group: "Arena", title: "Arena intro", description: "Introdução visual da Arena." },
  { id: "arena/no-round", group: "Arena", title: "No round", description: "Sem rodada disponível." },
  { id: "arena/upcoming", group: "Arena", title: "Upcoming round", description: "Próxima rodada e carrossel." },
  { id: "arena/live", group: "Arena", title: "Live", description: "Partida ao vivo demonstrativa." },
  { id: "arena/half-time", group: "Arena", title: "Half-time", description: "Intervalo demonstrativo." },
  { id: "arena/finished", group: "Arena", title: "Finished", description: "Resultado final demonstrativo." },
  { id: "arena/pitch-empty", group: "Arena", title: "Empty pitch", description: "Campo sem escalação." },
  { id: "arena/pitch-complete", group: "Arena", title: "Complete pitch", description: "Campo completo, treinador e pontuação." },
  { id: "arena/frozen", group: "Arena", title: "Frozen state", description: "Elegibilidade bloqueada para nova rodada." },
  { id: "match-centre/upcoming", group: "Match Centre", title: "Upcoming", description: "Confronto com data e horário." },
  { id: "match-centre/live", group: "Match Centre", title: "Live", description: "Timeline, placar e estatísticas." },
  { id: "match-centre/half-time", group: "Match Centre", title: "Half-time", description: "Intervalo, timeline e estatísticas." },
  { id: "match-centre/finished", group: "Match Centre", title: "Finished", description: "FT e pontuação final." },
  { id: "match-centre/archive", group: "Match Centre", title: "Archive", description: "Arquivo de partidas." },
  { id: "match-centre/invalid-fixture", group: "Match Centre", title: "Invalid fixture", description: "Fixture inválido." },
  { id: "match-centre/no-fixture", group: "Match Centre", title: "No fixture", description: "Sem fixture selecionado." },
  { id: "market/list", group: "Market", title: "Market list", description: "Lista e filtros do mercado." },
  { id: "market/players", group: "Market", title: "Players", description: "Jogadores por tier e moeda." },
  { id: "market/coaches", group: "Market", title: "Coaches", description: "Treinadores por tier e moeda." },
  { id: "market/cart", group: "Market", title: "Cart", description: "Carrinho demonstrativo, sem checkout." },
  { id: "market/empty", group: "Market", title: "Empty / unavailable", description: "Estados vazio e indisponível." },
  { id: "profiles/player", group: "Perfis", title: "Player Profile", description: "Dados públicos e dados TouchLine demonstrativos." },
  { id: "profiles/coach", group: "Perfis", title: "Coach Profile", description: "Perfil de treinador demonstrativo." },
  { id: "profiles/club", group: "Perfis", title: "Club Profile", description: "Perfil de clube demonstrativo." },
  { id: "profiles/no-data", group: "Perfis", title: "No data", description: "Estado sem dados." },
  { id: "competition/table", group: "Competição", title: "League table", description: "Tabela demonstrativa." },
  { id: "competition/rankings", group: "Competição", title: "Rankings", description: "Rankings e rodada." },
  { id: "competition/top-11", group: "Competição", title: "Top 11", description: "Top 11 demonstrativo." },
  { id: "competition/statistics", group: "Competição", title: "Scorers & statistics", description: "Artilheiros, assistências e clean sheets." },
  { id: "communication/central", group: "Comunicação", title: "TouchLine Central", description: "Mensagens, categorias e deep links." },
  { id: "communication/inbox", group: "Comunicação", title: "ClubOwner Inbox", description: "Lidas, não lidas e filtros." },
  { id: "communication/notifications", group: "Comunicação", title: "Notifications", description: "Notificações demonstrativas." },
  { id: "admin/overview", group: "Admin demonstrativo", title: "Admin overview", description: "Representação visual, sem ligação administrativa." },
  { id: "admin/cards", group: "Admin demonstrativo", title: "Admin cards", description: "Tabela, filtros e ações desativadas." },
  { id: "admin/finance", group: "Admin demonstrativo", title: "Admin finance", description: "Dados sintéticos; nenhuma operação financeira." },
] as const;

export const TOUCHLINE_AUDIT_PERSONAS = [
  "Anonymous",
  "New User",
  "ClubOwner no coach",
  "ClubOwner with coach",
  "Incomplete squad",
  "Complete squad",
  "Founder",
  "Frozen club",
  "Admin read-only",
] as const;

export const TOUCHLINE_AUDIT_MATCH_STATES = ["Upcoming", "Live", "Half-time", "Finished", "No fixture"] as const;
