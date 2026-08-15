# Vercel — candidatos de limpeza e decisão

**Data:** 11 de agosto de 2026
**Regra:** nenhum item abaixo foi removido, rotacionado ou alterado automaticamente.

| Categoria | Item | Classificação | Motivo / gate |
|---|---|---|---|
| Deployments | Produções/Previews com erro recentes | KEEP como evidência até a causa estar corrigida | Contêm logs das falhas de TypeScript e de isolamento Preview |
| Deployments | Previews de `work/manchester-city-manual-import-20260809`, `preview/market-contract-readiness-20260809`, `HEAD`, `safety/touchline-2026-06-28-wip` | REQUIRES_LUIZ_APPROVAL | Podem ser úteis para recuperação; só limpar após identificar branch/commit que não será reutilizado |
| DNS | Registros legados de apex/www | REQUIRES_LUIZ_APPROVAL | Vercel recomenda novos registros; alteração ocorre fora da Vercel e pode afetar e-mail/DNS se feita incorretamente |
| Env vars | Variáveis de produto presentes em Preview | REQUIRES_ARCHITECTURE_DECISION | O estado atual falha fechado. Não remover sem criar o projeto/escopo Preview isolado adequado |
| Security | 2FA ausente | ACTION_REQUIRED_BY_LUIZ | Exige cadastro de autenticador da conta; nenhuma automação deve fazê-lo |
| Observabilidade | Analytics, Speed Insights, Observability Plus desativados | SAFE_TO_ENABLE_AFTER_APPROVAL | Pode melhorar diagnóstico; tem impacto de privacidade/uso, portanto não habilitado automaticamente |
| Bypass automation secret | Segredo existente sem proteções ativas | REVIEW_LATER | Não expor/rotacionar sem inventário de consumidores; sem efeito enquanto proteção está desativada |
| Git hooks | Não há deploy hooks no painel | SAFE_TO_IGNORE | Nenhum hook obsoleto a limpar |
| Cron | Cron habilitado sem job exibido | SAFE_TO_IGNORE / VERIFY_WITH_CODE | Não desabilitar globalmente; validar a configuração versionada antes de mexer |

## Itens que não são candidatos de remoção

- Projeto `touchline-arena-official`;
- domínio técnico `touchline-arena-official.vercel.app`;
- domínio principal e `www`;
- deployment de produção Ready `FEtvXPhXPtZnsshsXg6QCxNtMP2N`;
- logs de erro recentes.

O motivo é preservar rollback, evidência e acesso ao site enquanto a recuperação de cards estiver em curso.
