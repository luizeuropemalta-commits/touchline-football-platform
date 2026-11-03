# Fotos — causa de bootstrap comprovada na QA

## Ação e resultado

Alvo exclusivo: xgxbwqxjssxxuihuwmgy / touchline-avatar-retention. Publicado o pacote de 11 arquivos byte a byte iguais ao HEAD 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694, isolado de todo WIP. Revisão independente e manifesto em artifacts/avatar-notifications-20261031. Isto não é o deploy Vercel da candidata.

Resultado remoto: versão 6 ACTIVE, verify_jwt=true; bundle SHA-256 30fac5b61df9cb9fb5660d16050d89eb5824b2a238d4224396280045eaa90dd1. Receipt: retention-diagnostic-v6-deployment.json.

1. Gate ausente/OFF: GET autenticado pela chave pública anon retornou 503 em 31/10 23:21:17Z. Log function_logs registrou QA_RETENTION_FLAG_OFF.
2. Ativação temporária somente TOUCHLINE_QA_AVATAR_RETENTION_ENABLED=true, já autorizada no escopo QA: GET 503 em 23:24:35Z. Novo log de bootstrap registrou QA_RETENTION_KEY_FORMAT_INCOMPATIBLE.
3. Gate removido novamente; CLI confirmou unset. Nenhum POST, RPC de retenção, upload ou exclusão foi executado. Configuração da Vercel e flags de fotos do cliente permanecem intactas.

O ramo de rejeição do formato está comprovado. Isso ainda não identifica o conteúdo/formato exato da variável injetada, não prova causa de rotação nem autoriza enfraquecer autenticação. Nenhum valor de credencial foi mostrado ou salvo neste documento.

## Próximo passo

Revisar o contrato de configuração da função e preparar remediação com vínculo verificável ao projeto QA, preservando autenticação de plataforma e autorização interna. Após composição válida, provar retenção real, agendamento e consumidores antes de abrir upload.

## Limites

Fotos continuam PENDENTES. ACTIVE e GET não comprovam retenção. Nenhum novo build Vercel; nenhuma mudança em Production ou Stripe Live. A emissão de logs foi a única alteração de runtime deste recorte; rollback funcional é manter a flag ausente/OFF, como restaurado.
