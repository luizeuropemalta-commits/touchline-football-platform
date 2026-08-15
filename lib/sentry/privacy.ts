import type { ErrorEvent, Event } from "@sentry/nextjs";

const SECRET_KEY =
  /authorization|cookie|password|passwd|secret|token|service[_-]?role|session|supabase|stripe|sportmonks/i;
const SECRET_VALUE =
  /(?:bearer\s+\S+|sbp_[A-Za-z0-9_-]+|sntrys_[A-Za-z0-9_\/+.-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/gi;

function scrubText(value: string): string {
  return value.replace(SECRET_VALUE, "[Filtered]");
}

function scrubUnknown(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return scrubText(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => scrubUnknown(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SECRET_KEY.test(key) ? "[Filtered]" : scrubUnknown(nested, seen),
    ]),
  );
}

export function scrubTouchlineSentryEvent<T extends Event | ErrorEvent>(event: T): T {
  const scrubbed = scrubUnknown(event) as T;

  // Keep a stable internal identifier when available, but never attach a
  // ClubOwner's email, username or network address to an error event.
  if (scrubbed.user) {
    scrubbed.user = scrubbed.user.id ? { id: scrubbed.user.id } : undefined;
  }

  if (scrubbed.request) {
    scrubbed.request = {
      method: scrubbed.request.method,
      url: scrubbed.request.url?.split("?")[0],
    };
  }

  return scrubbed;
}

export function scrubTouchlineSentryBreadcrumb<T>(breadcrumb: T): T {
  return scrubUnknown(breadcrumb) as T;
}
