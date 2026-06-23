const DEFAULT_OWNER_EMAIL = "luizeuropemalta@gmail.com";

export function ownerEmails() {
  return (process.env.TOUCHLINE_OWNER_EMAILS || DEFAULT_OWNER_EMAIL)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email?: string | null) {
  if (!email) return false;
  return ownerEmails().includes(email.toLowerCase());
}

export function ownerGrantSubscriptionId(userId: string) {
  return `owner_grant_${userId}`;
}

