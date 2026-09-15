const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ownerEmails() {
  return [...new Set((process.env.TOUCHLINE_OWNER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => EMAIL_PATTERN.test(email)))];
}

export function isOwnerEmail(email?: string | null) {
  if (!email) return false;
  return ownerEmails().includes(email.trim().toLowerCase());
}
