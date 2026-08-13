import * as Sentry from "@sentry/nextjs";

import { touchlineSentryOptions } from "./lib/sentry/options";

Sentry.init(
  touchlineSentryOptions(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
);
