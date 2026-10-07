"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect, useSyncExternalStore } from "react";

import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlinePublicErrorCopy } from "@/lib/touchlineArena/public-error-i18n";

type GlobalErrorProps = { error: Error & { digest?: string } };

export default function GlobalError(props: GlobalErrorProps) {
  return <GlobalErrorContent error={props.error} />;
}

function GlobalErrorContent({ error, draftLocalesEnabled = false }: GlobalErrorProps & { draftLocalesEnabled?: boolean }) {
  const locale = useSyncExternalStore(
    () => () => {},
    () => resolveTouchlineCatalogueLocale(new URLSearchParams(window.location.search).get("lang"), draftLocalesEnabled),
    () => "en-GB" as TouchLineLocale,
  );
  const copy = getTouchlinePublicErrorCopy(locale, draftLocalesEnabled).error;

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang={locale} dir="ltr">
      <body>
        <NextError statusCode={0} title={copy.title} />
      </body>
    </html>
  );
}
