import { headers } from "next/headers";
import { notFound } from "next/navigation";

import styles from "./page.module.css";
import {
  isTouchlineIsolatedPreviewRequest,
  TOUCHLINE_ISOLATED_PREVIEW_HEADER,
} from "@/lib/touchlinePreview/isolation";
import {
  resolveTouchLinePresentationLocale,
  TOUCHLINE_PRESENTATION_LOCALE_HEADER,
} from "@/lib/touchlineArena/root-locale";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const copy = {
  "en-GB": {
    eyebrow: "Isolated Preview",
    title: "Preview boundary active",
    description: "This deployment is intentionally isolated. Product data, authentication, payments, analytics and external integrations are disabled.",
    facts: ["No production data", "No authentication", "No APIs or sync", "No payment activity"],
  },
  "pt-BR": {
    eyebrow: "Preview isolado",
    title: "Limite de Preview ativo",
    description: "Esta implantação está intencionalmente isolada. Dados do produto, autenticação, pagamentos, analytics e integrações externas estão desativados.",
    facts: ["Sem dados de produção", "Sem autenticação", "Sem APIs ou sync", "Sem atividade de pagamento"],
  },
} as const;

export default async function IsolatedPreviewPage() {
  const requestHeaders = await headers();
  if (!isTouchlineIsolatedPreviewRequest(requestHeaders.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER))) {
    notFound();
  }

  const locale = resolveTouchLinePresentationLocale(
    requestHeaders.get(TOUCHLINE_PRESENTATION_LOCALE_HEADER),
  );
  const content = copy[locale];

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="isolated-preview-title">
        <p className={styles.eyebrow}>{content.eyebrow}</p>
        <h1 id="isolated-preview-title" className={styles.title}>{content.title}</h1>
        <p className={styles.copy}>{content.description}</p>
        <ul className={styles.facts} aria-label={content.eyebrow}>
          {content.facts.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
      </section>
    </main>
  );
}
