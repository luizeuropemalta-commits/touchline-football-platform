export type PeopleLocale = "pt-BR" | "en-GB";
export type PublicOwner = { publicId: string; displayName: string };
export type OwnPublicOwner = PublicOwner & { published: boolean; followerCount: number };
export type PublicOwnerProfile = PublicOwner & { followerCount: number; following: boolean; viewer: "self" | "member" | "guest" };
export const publicOwnerId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const publicOwnerName = (value: unknown): value is string => typeof value === "string" && value.trim() === value && [...value].length >= 2 && [...value].length <= 60 && !/[\u0000-\u001f\u007f@]/u.test(value);
export const publicOwnerQuery = (value: string) => [...value].length >= 2 && [...value].length <= 80 && !/[\u0000-\u001f\u007f@]/u.test(value);
export const peopleLocale = (value: unknown): PeopleLocale => value === "pt-BR" ? "pt-BR" : "en-GB";
export const publicOwnerHref = (id: string, locale: PeopleLocale) => `/clubowners/${encodeURIComponent(id)}?lang=${locale}`;

function owner(value: unknown): PublicOwner {
  const row = value as Partial<PublicOwner> | null;
  if (!row || !publicOwnerId(row.publicId) || !publicOwnerName(row.displayName)) throw new Error("INVALID_PUBLIC_OWNER");
  return { publicId: row.publicId, displayName: row.displayName };
}
export function parsePublicOwners(value: unknown): PublicOwner[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("INVALID_PUBLIC_OWNERS");
  return value.map(owner);
}
export function parseOwnPublicOwner(value: unknown): OwnPublicOwner | null {
  if (value === null) return null;
  const row = value as OwnPublicOwner;
  if (typeof row?.published !== "boolean" || !Number.isSafeInteger(row.followerCount) || row.followerCount < 0) throw new Error("INVALID_OWN_PUBLIC_OWNER");
  return { ...owner(row), published: row.published, followerCount: row.followerCount };
}
export function parsePublicOwnerProfile(value: unknown): PublicOwnerProfile | null {
  if (value === null) return null;
  const row = value as PublicOwnerProfile;
  if (!Number.isSafeInteger(row?.followerCount) || row.followerCount < 0 || typeof row.following !== "boolean" || !["self", "member", "guest"].includes(row.viewer)) throw new Error("INVALID_PUBLIC_PROFILE");
  return { ...owner(row), followerCount: row.followerCount, following: row.following, viewer: row.viewer };
}
export function samePeopleOrigin(request: Request) {
  try { return new URL(request.headers.get("origin") ?? "").origin === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site"; } catch { return false; }
}

const pt = {
  title: "Encontre ClubOwners", introduction: "Busque pelo início do nome público ou pelo ID completo. Só aparecem perfis que escolheram ser públicos.",
  query: "Nome público ou ID completo", search: "Buscar", queryHelp: "Digite de 2 a 80 caracteres. Até 20 resultados por busca.", empty: "Nenhum perfil público encontrado.", limit: "Mostrando até 20 perfis. Refine o nome ou use o ID completo.",
  own: "Seu perfil público", name: "Nome público", consent: "Quero tornar meu nome público e permitir que outros ClubOwners me encontrem e sigam.",
  privacy: "Somente o nome escolhido, o ID público e o total de seguidores são públicos. Email, saldo, elenco e foto privada não são publicados.",
  save: "Salvar perfil", saved: "Perfil salvo.", hidden: "Seu perfil está oculto.", published: "Seu perfil está público.", permanent: "Seu ID é permanente, mesmo se você mudar o nome ou ocultar o perfil.",
  nameHelp: "Use de 2 a 60 caracteres. Não use email nem dados privados.", view: "Ver perfil", back: "Encontrar ClubOwners", myClub: "Meu ClubOwner", id: "ID público", followers: "Seguidores", follow: "Seguir", unfollow: "Deixar de seguir", self: "Este é seu perfil público.",
  login: "Entrar para publicar ou seguir", loading: "Carregando…", saving: "Salvando…", unavailable: "A descoberta de ClubOwners está indisponível no momento.", error: "Não foi possível confirmar os dados. Tente novamente.", writeError: "Não foi possível confirmar a alteração. Atualize os dados antes de tentar novamente.", retry: "Atualizar dados", notFound: "Perfil público não encontrado.", invalid: "Confira o nome ou ID informado.", forbidden: "Sua conta não tem acesso a esta ação.",
};
const en: typeof pt = {
  title: "Find ClubOwners", introduction: "Search by the start of a public name or the complete ID. Only profiles that chose to be public appear.",
  query: "Public name or complete ID", search: "Search", queryHelp: "Enter 2 to 80 characters. Up to 20 results per search.", empty: "No public profiles found.", limit: "Showing up to 20 profiles. Refine the name or use the complete ID.",
  own: "Your public profile", name: "Public name", consent: "I want to make my name public and allow other ClubOwners to find and follow me.",
  privacy: "Only your chosen name, public ID and follower count are public. Email, balance, squad and private photo are not published.",
  save: "Save profile", saved: "Profile saved.", hidden: "Your profile is hidden.", published: "Your profile is public.", permanent: "Your ID stays the same when you rename or hide your profile.",
  nameHelp: "Use 2 to 60 characters. Do not use an email or private information.", view: "View profile", back: "Find ClubOwners", myClub: "My ClubOwner", id: "Public ID", followers: "Followers", follow: "Follow", unfollow: "Unfollow", self: "This is your public profile.",
  login: "Sign in to publish or follow", loading: "Loading…", saving: "Saving…", unavailable: "ClubOwner discovery is currently unavailable.", error: "The data could not be confirmed. Please try again.", writeError: "The change could not be confirmed. Refresh the data before trying again.", retry: "Refresh data", notFound: "Public profile not found.", invalid: "Check the name or ID you entered.", forbidden: "Your account cannot perform this action.",
};
export const peopleCopy = (locale: PeopleLocale) => locale === "pt-BR" ? pt : en;
