export type PeopleLocale = "pt-BR" | "en-GB";
export type PublicOwner = { publicId: string; displayName: string; avatarUrl?: string | null };
export type OwnPublicOwner = PublicOwner & { published: boolean; followerCount: number; photoPublished?: boolean };
export type PublicOwnerPlanKey = "beta" | "standard" | "master" | "vip";
export type PublicOwnerProfile = PublicOwner & { standing?: { rank: number; points: number } | null; planKey?: PublicOwnerPlanKey | null; followerCount: number; following: boolean; viewer: "self" | "member" | "guest" };
export type PublicOwnerSearchResult = PublicOwnerProfile & { rank: number | null };
export type PublicOwnerSearchPage = { profiles: PublicOwnerSearchResult[]; nextCursor: string | null };
export const publicOwnerId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const publicOwnerName = (value: unknown): value is string => typeof value === "string" && value.trim() === value && [...value].length >= 2 && [...value].length <= 60 && !/[\u0000-\u001f\u007f@]/u.test(value);
export const normalizePublicOwnerSearchName = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/gu, " ");
export const publicOwnerQuery = (value: string) => [...normalizePublicOwnerSearchName(value)].length >= 2 && [...value].length <= 80 && !/[\u0000-\u001f\u007f@]/u.test(value);
/** Literal name fragments only. Public identifiers remain URL/identity keys. */
export const publicOwnerNameMatchesQuery = (displayName: string, query: string) => {
  const tokens = normalizePublicOwnerSearchName(query).split(" ").filter(Boolean);
  const name = normalizePublicOwnerSearchName(displayName);
  return tokens.length > 0 && tokens.every(token => name.includes(token));
};
export const peopleLocale = (value: unknown): PeopleLocale => value === "pt-BR" ? "pt-BR" : "en-GB";
export const publicOwnerHref = (id: string, locale: PeopleLocale) => `/clubowners/${encodeURIComponent(id)}?lang=${locale}`;
export const publicOwnerSettingsHref = (locale: PeopleLocale) => `/clubowner?lang=${locale}&settings=profile#public-profile`;
export const publicOwnerAvatarHref = (id: string, version: string) => `/api/touchline/clubowners/${id.toLowerCase()}/avatar?v=${version}`;
export const isPublicOwnerAvatarUrl = (value: unknown, id: string): value is string => typeof value === "string"
  && value.startsWith(`/api/touchline/clubowners/${id.toLowerCase()}/avatar?v=`)
  && /^[a-f0-9]{64}$/.test(value.slice(value.indexOf("?v=") + 3));

function owner(value: unknown): PublicOwner {
  const row = value as Partial<PublicOwner> | null;
  if (!row || !publicOwnerId(row.publicId) || !publicOwnerName(row.displayName)) throw new Error("INVALID_PUBLIC_OWNER");
  if (row.avatarUrl !== undefined && row.avatarUrl !== null && !isPublicOwnerAvatarUrl(row.avatarUrl, row.publicId)) throw new Error("INVALID_PUBLIC_OWNER_AVATAR");
  return { publicId: row.publicId, displayName: row.displayName, ...(row.avatarUrl !== undefined ? { avatarUrl: row.avatarUrl } : {}) };
}
export function parsePublicOwners(value: unknown): PublicOwner[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("INVALID_PUBLIC_OWNERS");
  return value.map(owner);
}
export function parseOwnPublicOwner(value: unknown): OwnPublicOwner | null {
  if (value === null) return null;
  const row = value as OwnPublicOwner;
  if (typeof row?.published !== "boolean" || !Number.isSafeInteger(row.followerCount) || row.followerCount < 0) throw new Error("INVALID_OWN_PUBLIC_OWNER");
  if (row.photoPublished !== undefined && (typeof row.photoPublished !== "boolean" || (row.photoPublished && !row.published))) throw new Error("INVALID_OWN_PHOTO_CONSENT");
  return { ...owner(row), published: row.published, followerCount: row.followerCount,
    ...(row.photoPublished !== undefined ? { photoPublished: row.photoPublished } : {}) };
}
export function parsePublicOwnerProfile(value: unknown): PublicOwnerProfile | null {
  if (value === null) return null;
  const row = value as PublicOwnerProfile;
  if (!Number.isSafeInteger(row?.followerCount) || row.followerCount < 0 || typeof row.following !== "boolean" || !["self", "member", "guest"].includes(row.viewer)) throw new Error("INVALID_PUBLIC_PROFILE");
  if (row.planKey !== undefined && row.planKey !== null && !["beta", "standard", "master", "vip"].includes(row.planKey)) throw new Error("INVALID_PUBLIC_PLAN");
  if (row.standing !== undefined && row.standing !== null && (!Number.isSafeInteger(row.standing.rank) || row.standing.rank < 1 || typeof row.standing.points !== "number" || !Number.isFinite(row.standing.points))) throw new Error("INVALID_PUBLIC_STANDING");
  return { ...(row.standing !== undefined ? { standing: row.standing ? { rank: row.standing.rank, points: row.standing.points } : null } : {}), ...owner(row), followerCount: row.followerCount, following: row.following, viewer: row.viewer, planKey: row.planKey ?? null };
}
export function parsePublicOwnerSearchPage(value: unknown): PublicOwnerSearchPage {
  const page = value as PublicOwnerSearchPage | null;
  if (!page || !Array.isArray(page.profiles) || page.profiles.length > 20
    || !(page.nextCursor === null || (typeof page.nextCursor === "string" && page.nextCursor.length <= 1024 && /^[A-Za-z0-9_-]+$/.test(page.nextCursor)))) throw new Error("INVALID_PUBLIC_SEARCH_PAGE");
  const seen = new Set<string>();
  const profiles = page.profiles.map(row => {
    const profile = parsePublicOwnerProfile(row);
    if (!profile || !(row.rank === null || (Number.isSafeInteger(row.rank) && row.rank > 0)) || seen.has(profile.publicId.toLowerCase())) throw new Error("INVALID_PUBLIC_SEARCH_RESULT");
    seen.add(profile.publicId.toLowerCase());
    return { ...profile, rank: row.rank };
  });
  return { profiles, nextCursor: page.nextCursor };
}
export function samePeopleOrigin(request: Request) {
  try { return new URL(request.headers.get("origin") ?? "").origin === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site"; } catch { return false; }
}

const pt = {
  rankedTitle: "ClubOwners no ranking", rank: "Posição", rankPending: "Sem posição", clearSearch: "Limpar busca", close: "Fechar", moreResults: "Ver mais", browseEmpty: "Ainda não há perfis públicos.",
  friends: "Encontrar amigos", title: "Encontre ClubOwners", introduction: "Busque pelo nome do ClubOwner. Só aparecem perfis que escolheram ser públicos.",
  query: "Buscar por nome", search: "Buscar", queryHelp: "Digite parte do nome, com pelo menos 2 caracteres.", empty: "Nenhum perfil público encontrado.", limit: "Mostrando até 20 perfis. Refine o nome para encontrar seu amigo.",
  own: "Seu perfil público", name: "Nome público", consent: "Quero tornar meu nome público e permitir que outros ClubOwners me encontrem e sigam.",
  manageProfile: "Meu perfil público", privacySettings: "Privacidade do perfil", discoverableHelp: "Seus amigos encontram seu perfil pelo nome público.",
  privacy: "Somente o nome escolhido, o ID público, o plano ativo, a posição no ranking e o total de seguidores são públicos. Email, saldo, elenco e foto privada não são publicados.",
  photoConsent: "Quero exibir minha foto atual e as próximas fotos que eu escolher no meu perfil público, inclusive para visitantes sem login.",
  photoPrivacy: "Nome, ID público, plano ativo, posição no ranking e seguidores ficam visíveis no perfil público. Sua foto só aparece com a autorização separada abaixo. Email, saldo e elenco continuam privados.",
  photoAlt: "Foto pública", photoMissing: "Sem foto pública", photoLoading: "Carregando foto pública", photoUnavailable: "Foto pública temporariamente indisponível", photoRetry: "Atualizar foto",
  save: "Salvar perfil", saved: "Perfil salvo.", hidden: "Seu perfil está oculto.", published: "Seu perfil está público.", permanent: "Seu ID é permanente, mesmo se você mudar o nome.",
  nameHelp: "Use de 2 a 60 caracteres. Não use email nem dados privados.", view: "Ver perfil", back: "Encontrar ClubOwners", myClub: "Meu ClubOwner", id: "ID público", followers: "Seguidores", follow: "Seguir", following: "Seguindo", unfollow: "Deixar de seguir", self: "Este é seu perfil público.",
  login: "Entrar para publicar ou seguir", loading: "Carregando…", saving: "Salvando…", unavailable: "A descoberta de ClubOwners está indisponível no momento.", error: "Não foi possível confirmar os dados. Tente novamente.", writeError: "Não foi possível confirmar a alteração. Atualize os dados antes de tentar novamente.", retry: "Atualizar dados", notFound: "Perfil público não encontrado.", invalid: "Confira o nome informado.", forbidden: "Sua conta não tem acesso a esta ação.",
};
const en: typeof pt = {
  rankedTitle: "ClubOwners in the ranking", rank: "Rank", rankPending: "Unranked", clearSearch: "Clear search", close: "Close", moreResults: "Show more", browseEmpty: "There are no public profiles yet.",
  friends: "Find friends", title: "Find ClubOwners", introduction: "Search by ClubOwner name. Only profiles that chose to be public appear.",
  query: "Search by name", search: "Search", queryHelp: "Enter part of a name, using at least 2 characters.", empty: "No public profiles found.", limit: "Showing up to 20 profiles. Refine the name to find your friend.",
  own: "Your public profile", name: "Public name", consent: "I want to make my name public and allow other ClubOwners to find and follow me.",
  manageProfile: "My public profile", privacySettings: "Profile privacy", discoverableHelp: "Friends can find your profile by your public name.",
  privacy: "Only your chosen name, public ID, active plan, ranking position and follower count are public. Email, balance, squad and private photo are not published.",
  photoConsent: "I want to display my current photo and future photos I choose on my public profile, including to visitors who are not signed in.",
  photoPrivacy: "Your name, public ID, active plan, ranking position and follower count are visible on your public profile. Your photo appears only with the separate permission below. Email, balance and squad stay private.",
  photoAlt: "Public photo", photoMissing: "No public photo", photoLoading: "Loading public photo", photoUnavailable: "Public photo temporarily unavailable", photoRetry: "Refresh photo",
  save: "Save profile", saved: "Profile saved.", hidden: "Your profile is hidden.", published: "Your profile is public.", permanent: "Your ID stays the same when you rename your profile.",
  nameHelp: "Use 2 to 60 characters. Do not use an email or private information.", view: "View profile", back: "Find ClubOwners", myClub: "My ClubOwner", id: "Public ID", followers: "Followers", follow: "Follow", following: "Following", unfollow: "Unfollow", self: "This is your public profile.",
  login: "Sign in to publish or follow", loading: "Loading…", saving: "Saving…", unavailable: "ClubOwner discovery is currently unavailable.", error: "The data could not be confirmed. Please try again.", writeError: "The change could not be confirmed. Refresh the data before trying again.", retry: "Refresh data", notFound: "Public profile not found.", invalid: "Check the name you entered.", forbidden: "Your account cannot perform this action.",
};
export const peopleCopy = (locale: PeopleLocale) => locale === "pt-BR" ? pt : en;
