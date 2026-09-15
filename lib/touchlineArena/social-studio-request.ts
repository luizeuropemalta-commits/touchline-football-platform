import { hasTouchLineArenaAccess } from "./auth-access.ts";
import { parseStudioAction, studioSameOrigin, type StudioAction, type StudioRecord } from "./social-studio-contract.ts";

export function studioUserCanReview(user: { id?: string; email?: string | null; app_metadata?: Record<string, unknown> } | null, ownerEmail: (email?: string | null) => boolean) {
  return !!user?.id && ownerEmail(user.email) && hasTouchLineArenaAccess(user);
}

function response(body: unknown, status: number) { return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }); }

export function studioRequestHandler(dependencies: { authorize: () => Promise<string | null>; save: (action: StudioAction, actorId: string) => Promise<StudioRecord> }) {
  return async function POST(request: Request) {
    if (!studioSameOrigin(request)) return response({ error: "Origem inválida." }, 403);
    const actorId = await dependencies.authorize();
    if (!actorId) return response({ error: "Acesso exclusivo do proprietário." }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return response({ error: "Formato inválido." }, 415);
    const text = await request.text();
    if (text.length > 12000) return response({ error: "Pedido demasiado grande." }, 413);
    try {
      const action = parseStudioAction(JSON.parse(text));
      const record = await dependencies.save(action, actorId);
      return response({ ok: true, record }, 200);
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      if (code === "IDEMPOTENCY_CONFLICT") return response({ error: "Este identificador de pedido já pertence a outra alteração ou proprietário. Confira o histórico antes de continuar." }, 409);
      if (code === "REVISION_CONFLICT") return response({ error: "Outra alteração foi salva. Atualize a página antes de continuar." }, 409);
      if (code === "PERSISTENCE_UNAVAILABLE" || code.startsWith("TL_SOCIAL_QA")) return response({ error: "Não foi possível confirmar a alteração no QA verificado. Confira o histórico quando o serviço estiver disponível antes de tentar novamente." }, 503);
      if (code.startsWith("OFFICIAL_SOURCE_")) return response({ error: "Fonte oficial publicada não verificada. Origem local, sintética ou desconhecida e identidades não oficiais não podem ser aprovadas. A integração canônica precisa ser validada; confira o histórico antes de repetir pedidos sem confirmação." }, code === "OFFICIAL_SOURCE_INTEGRATION_REQUIRED" || code === "OFFICIAL_SOURCE_UNVERIFIED" ? 503 : 409);
      const messages: Record<string, string> = {
        SURFACE_NOT_ALLOWED: "Esta apresentação não está autorizada para este tipo de arte. Destinos internos pendentes aguardam decisão do proprietário.",
        SCHEDULE_IN_PAST: "Escolha uma data e hora futuras.",
        NONEXISTENT_LOCAL_TIME: "Esta hora não existe nesse fuso devido à mudança de horário de verão.",
        INVALID_TIME_ZONE: "Fuso inválido. Use um nome como Europe/Malta ou America/Sao_Paulo.",
        FACTUAL_SNAPSHOT_EXPIRED_OR_INVALID: "Os dados da amostra venceram. Aguarde um retrato atual verificado.",
        INTERNAL_DESTINATION_PENDING: "O destino interno desta arte precisa ser definido antes de ser selecionado.",
        OFFICIAL_EVENT_HAS_NO_CLOCK_SCHEDULE: "Esta arte aguarda evento oficial; não usa horário estimado.",
        EYES_APPROVAL_REQUIRED: "O selo Olhos desta versão e apresentação ainda não aprovou composição e loop.",
        REVIEW_REASON_REQUIRED: "Informe um motivo entre 10 e 1.000 caracteres.",
        INVALID_AUTOMATION: "Configure de 1 a 10 tentativas e intervalo de 1 a 1.440 minutos.",
        AUTOMATION_TRIGGER_MISMATCH: "A regra deve corresponder ao tipo da arte; horário escolhido é obrigatório para a regra agendada.",
        INVALID_DELIVERY_TARGET: "O destino não corresponde a esta arte, plataforma e apresentação.",
        DELIVERY_NOT_RETRYABLE: "Este destino não pode ser repetido. Confira erro, recibo e pedidos anteriores.",
        DELIVERY_SOURCE_NOT_CURRENT: "Os dados desta entrega precisam ser revalidados antes de solicitar retentativa.",
        CURRENT_APPROVAL_REQUIRED: "A versão usada nesta entrega precisa ter modelo e legenda aprovados.",
        REVIEW_EVIDENCE_REQUIRED: "A revisão segura expirou, não terminou ou já foi usada. Reproduza novamente as duas voltas antes de aprovar.",
        INVALID_STUDIO_MUTATION: "A alteração não corresponde à revisão segura atual. Atualize a página e tente novamente.",
      };
      return response({ error: messages[code] ?? "Não foi possível confirmar o pedido. Atualize a página, confira os dados e reconcilie o histórico antes de tentar novamente." }, 400);
    }
  };
}
