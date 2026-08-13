import type { BrowserOptions, NodeOptions } from "@sentry/nextjs";

import {
  scrubTouchlineSentryBreadcrumb,
  scrubTouchlineSentryEvent,
} from "./privacy";

type RuntimeOptions = BrowserOptions | NodeOptions;

export function touchlineSentryOptions(dsn: string | undefined): RuntimeOptions {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      process.env.SENTRY_ENVIRONMENT ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV,
    release:
      process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
      process.env.SENTRY_RELEASE ??
      process.env.VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubTouchlineSentryEvent,
    beforeBreadcrumb: scrubTouchlineSentryBreadcrumb,
  };
}
