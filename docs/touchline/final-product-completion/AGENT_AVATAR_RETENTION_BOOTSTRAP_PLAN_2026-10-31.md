# Retenção de fotos — diagnóstico remoto e pacote mínimo

Data: 31/10/2026. Responsável: `avatar_notifications_finish`.
Classificação: AUDIT, somente leitura e documentação. Nenhuma alteração de código nesta etapa.
Worktree: `qa-stripe-release-20261029`; base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`, detached com WIP preservado.
Alvo exclusivo: Supabase QA `xgxbwqxjssxxuihuwmgy`, função `touchline-avatar-retention`.

## Conclusão operacional

O próximo passo concreto é **publicar somente o pacote local de observabilidade da Edge Function, inicialmente com o sinalizador de retenção ausente/false e `verify_jwt=true`**, após o preflight do responsável pela publicação. Depois, conferir o código fixo de bootstrap no log de uma nova instância. Não substituir credencial nem relaxar autorização com base no 503 atual.

Esta etapa não executou publicação, alteração de sinalizadores, obtenção de credenciais, POST, upload ou exclusão. O manifesto abaixo prepara a ação para o agente raiz; não declara o restante da candidata liberado.

Manifesto com caminhos, hashes de código, árvore de imports e diferenças remotas:
`artifacts/avatar-notifications-20261031/retention-diagnostic-deploy-manifest.json`.

## Evidência confirmada e limite de cada evidência

- A fonte retornada pelo conector Supabase está na **versão 5**, ACTIVE, `verify_jwt=true`, hash do bundle `0fe5099fb2528f6afa9f0e98709c0e283e78563221a0ea756318ee45c15195f2`. Ela ainda não contém o evento `qa_avatar_retention_bootstrap` nem o módulo local de diagnóstico de configuração. ACTIVE não comprova execução funcional.
- A comparação SHA-256 entre a fonte remota e a local mostrou somente dois arquivos substituídos (`index.ts`, `retention-server.ts`) e um módulo novo (`retention-configuration.ts`). Oito arquivos restantes do envelope são idênticos.
- `CURRENT_STATE.md`, registro de 30/10 nas linhas próximas de 6883–6913, documenta uma ativação temporária do sinalizador, GET autenticado retornando **503 com JSON da aplicação** `{"status":"unavailable"}`, inclusive após novo boot, e reversão do sinalizador. É evidência histórica já registrada; a operação não foi repetida nesta investigação.
- Esse JSON distingue a resposta histórica de um `BOOT_ERROR` da plataforma: naquela execução houve importação e criação do handler de indisponibilidade. Como GET é rejeitado antes de qualquer RPC/Storage, aqueles serviços não explicam esse 503 de GET. Ainda não está comprovado qual ramo de configuração/constructor produziu o handler.
- O mesmo registro preserva discrepância entre hashes de metadados de `SUPABASE_SERVICE_ROLE_KEY` e as chaves listadas pela API de gestão, com a comparação inicial incorreta descartada. **Discrepância não revela formato, claims, conteúdo, rotação nem causa do 503.** Nenhum valor ou hash de credencial foi obtido ou reproduzido nesta etapa.
- O manifesto antigo em `/private/tmp/touchline-avatar-bootstrap-observability-20261030.json` não está mais presente. O novo manifesto durável fixa os arquivos atuais; não substitui a prova histórica de execução.

## Bundle e compatibilidade

O grafo estático de imports de runtime, analisado com a API TypeScript instalada, contém **10 módulos TypeScript e um `deno.json`**. Não há dependência npm/JSR/URL, Supabase SDK, Sharp, Next ou browser no grafo de runtime. Existem somente os built-ins `node:buffer` e `node:crypto`; os usos incluem Buffer, `timingSafeEqual` e `randomUUID`. A importação de `club-owner-avatar-validation-types.ts` é exclusivamente de tipos e é apagada; também não consta no bundle remoto v5. `deno.json` mantém `nodeModulesDir: "none"` e `lock: false`.

A Supabase documenta suporte a APIs internas do Node e configuração isolada por função. A simples presença de `node:` não demonstra incompatibilidade; o GET histórico da aplicação também contradiz uma falha total desses imports naquela execução. Ainda é preciso comprovar o novo bundle no runtime hospedado. [Dependências oficiais](https://supabase.com/docs/guides/functions/dependencies).

O binário Deno não foi encontrado no PATH desta investigação; não se instalou pacote nem se executou servidor/build. Há um probe local existente, para execução futura se necessária e com runtime disponível:

```sh
deno run --no-config --no-npm --allow-net=127.0.0.1 --allow-read="$PWD" scripts/verify-avatar-retention-edge.mjs
```

Esse probe intercepta fetch/env e usa JWT sintético; só escuta loopback. Não substitui prova na Edge publicada. Testes do entrypoint real com DenoShim já estão no `focused.log` de 170 PASS do setor; não foram repetidos nem somados novamente.

## Formato da chave e contexto QA

O código atual exige origem exatamente `https://xgxbwqxjssxxuihuwmgy.supabase.co` e formato JWT de três segmentos, com payload `ref` desse projeto e `role=service_role`. Esse parser vincula a **configuração**; não verifica assinatura do token enviado por um chamador. A plataforma mantém `verify_jwt=true` e o POST compara o bearer com a chave capturada usando igualdade em tempo constante.

As variáveis legadas `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` continuam documentadas separadamente das novas coleções `SUPABASE_PUBLISHABLE_KEYS` e `SUPABASE_SECRET_KEYS`. Portanto, não assumir que a variável legada passou a carregar uma chave opaca. Os nomes `SUPABASE_` são reservados; não tentar sobrescrever a variável injetada. [Variáveis oficiais](https://supabase.com/docs/guides/functions/secrets).

As novas chaves opacas e as legadas coexistem durante migração; a verificação da plataforma, sozinha, não autentica chamadas feitas apenas com uma API key. A migração de chaves é uma frente separada e não deve ser simulada removendo a validação de projeto/papel ou desligando JWT para eliminar este erro. [Migração oficial](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

## Sequência curta para o agente raiz

1. Revalidar identidade QA, versão/hash remoto e hashes do manifesto. Se houver drift, reconciliar antes de publicar. Consolidar snapshot revisado e preflight; não incluir secrets, SQL, outros endpoints nem variáveis da Vercel no envelope.
2. Confirmar por metadados que `TOUCHLINE_QA_AVATAR_RETENTION_ENABLED` está ausente/false. Publicar apenas os 11 arquivos do manifesto com `verify_jwt=true`. Registrar nova versão e hash retornados, sem presumir que será v6. Não ligar upload do cliente.
3. Fazer um GET autorizado por mecanismo já aprovado, sem imprimir o bearer, no caminho exato da função. Com gate OFF, esperar JSON genérico 503 e evento fixo `QA_RETENTION_FLAG_OFF` no log da **nova** instância. Uma chamada sem JWT pode parar na plataforma antes de executar a função; isso não testa bootstrap.
4. Com esse primeiro gate aprovado, o responsável pode repetir a ativação temporária QA já autorizada, sem qualquer outro secret. Fazer GET e correlacionar versão/instância/log. O estado é capturado em `compose()` e uma instância OFF não adota a alteração: precisa observar nova composição. A plataforma documenta secrets disponíveis sem redeploy, mas este código deliberadamente captura e verifica um snapshot; não repetir deploy ou enfraquecer essa proteção só para forçar atualização. [Comportamento da plataforma](https://supabase.com/docs/guides/functions/secrets).
5. GET **405** na versão correta demonstra composição e método bloqueado, sem RPC/Storage. **Não comprova igualdade do bearer interno, acesso à RPC, autorização de exclusão ou retenção real**, pois a checagem do método vem antes da autenticação do handler.
6. Se retornar 503, usar a matriz abaixo; não fazer POST de exploração. Restaurar exatamente o gate temporário ausente/false quando o diagnóstico terminar ou falhar. Confirmar nova composição e manter flags do cliente fechadas.
7. Só depois de composição correta e baseline global autorizado, executar as fases do runner existente e comprovar os registros de retenção. Não remover objetos manualmente para produzir um resultado esperado.

O diagnóstico não precisa de build Vercel, migração ou alteração no banco. A função já existe; o pacote altera somente observabilidade e extração equivalente do predicado de configuração. A disponibilidade de retenção continua pendente mesmo depois do deploy diagnóstico.

## Matriz para localizar o problema

| Evidência | Significado | Próxima verificação sem expor dados |
|---|---|---|
| 503 da plataforma, `BOOT_ERROR`/`worker boot error`, sem evento da aplicação | Falha antes do handler; import, sintaxe ou runtime | Conferir entrypoint/import map, presença/hash dos 11 arquivos e log de boot. Não procurar erro de RPC nesse estágio |
| `QA_RETENTION_FLAG_OFF` | Instância capturou gate diferente de true | Conferir metadata da flag e correlação com nova instância/versão; não repetir POST |
| `QA_RETENTION_CONFIGURATION_MISSING` | URL ou chave injetada ausente/vazia | Conferir contexto do projeto e nomes da configuração, sem ler/registrar o valor |
| `QA_RETENTION_ORIGIN_INCOMPATIBLE` | Origem capturada não é a canônica QA | Conferir target da função e injeção do ambiente; nunca aceitar Production como alternativa |
| `QA_RETENTION_KEY_FORMAT_INCOMPATIBLE` | Valor capturado não satisfaz o formato JWT limitado | Confirmar com a plataforma o contrato da variável legada; não imprimir o valor nem trocar para chave opaca |
| `QA_RETENTION_KEY_CLAIMS_INCOMPATIBLE` | Payload malformado ou vínculo ref/role diferente | Validar contexto/injeção com suporte usando somente código, versão e instante; não remover a vinculação |
| `QA_RETENTION_CONFIGURATION_READ_FAILED` | Exceção durante leitura/classificação da configuração | Inspecionar log de runtime e contexto sem serializar exceção/env; módulo lê três variáveis fixas |
| `QA_RETENTION_CONSTRUCTOR_FAILED` | Exceção após configuração aprovada, antes de servir o handler normal | Conferir fetch/bind e factories locais no runtime; construtores não deveriam emitir RPC/Storage |
| `QA_RETENTION_RUNTIME_MISSING`, seguido de falta de listener | Global Deno indisponível | Corrigir runtime/entrypoint; esse ramo não consegue chamar `Deno.serve` |
| 401 da plataforma antes da aplicação | Autorização da chamada não passou pela plataforma | Validar mecanismo autorizado e tipo de token; não desligar verify_jwt |
| GET 405 | Composição pronta, método não admitido | Passar à prova controlada de POST, após baseline global; não declarar retenção pronta |
| POST com Origin e 401 genérico | Request proibido por origem, antes da comparação interna | Confirma apenas essa barreira, não que o bearer foi aceito |
| POST autorizado bodyless com 503 | Pode ser ocupação, drift, deadline, RPC ou Storage | Ler journal/scans/attempts e logs; não repetir cegamente uma execução de resultado incerto |

Falhas de imports estáticos ocorrem antes de `compose()` e não podem produzir os códigos locais. O evento é emitido no máximo uma vez por isolate; ausência em chamadas seguintes não prova ausência de falha. A distinção de BOOT_ERROR e logs de boot segue a documentação oficial. [503 da Edge](https://supabase.com/kb/troubleshooting/edge-function-503-response).

## Gates para foto realmente disponível

1. **Retenção executada:** usar `scripts/qa/verify-touchline-avatar-retention.mts` primeiro em dry-run e depois uma etapa autorizada de cada vez: inspect → publish-first → publish-second → retain → verify. A fixture precisa ser CUSTOMER QA permitida, revisão zero e sem foto gerenciada; revalidar porque o snapshot antigo pode ter mudado. O runner não autoriza a si próprio nem ignora fila global.
2. **Antes de cada mutação:** SELECT externo confirma identidade, operações elegíveis de todos os atores, candidates/leases e ausência de outro writer/scheduler concorrente. Credencial injetada apenas pelo canal protegido já autorizado; nunca em arquivo de código, log ou chat.
3. **Retenção real:** esperar `terminal_at + 5 minutos`, sem backdating. Um único POST da Edge. Demonstrar candidato/attempt/resultado persistidos, objeto antigo ausente no Storage, imagem atual preservada e nenhuma alteração fora do escopo. Se perder a resposta, verificar estado; não reenviar como nova operação.
4. **Cadência:** não há cron de avatar comprovado. O SELECT anterior não encontrou nome/comando com avatar/retention, e o `vercel.json` local não declara cron; isso não exclui scheduler externo. Identificar ou configurar separadamente um agendamento protegido, impedir sobreposição, verificar duas execuções em horários distintos e alertar falha/atraso. Um POST manual não é automação.
5. **Aplicação publicada:** comprovar flags efetivas de read/upload/selection/retention-ready, público permitido e origem QA. Só marcar RETENTION_READY depois das provas anteriores. Após configuração e publicação da candidata correta, enviar foto real como cliente, recarregar e verificar confirmação/erro/retentativa sem duplicação.
6. **Consumidores:** foto atual em perfil, busca e ranking nas duas contas; visibilidade/consentimento, foto substituída/revogada e cache coerentes. Bucket permanece privado e nenhum original abandonado é servido como atual.
7. **Dispositivos:** Safari nativo, iPhone e tablet continuam gates separados. O teste WebKit local não comprova rasterização do blur neste Mac, conforme relatório do setor.

## Fechamento documental

**MISSION:** plano de diagnóstico do bootstrap QA da retenção.
**SCOPE:** fonte remota/local, imports, documentação oficial, manifesto e próximos gates. Sem mutação de serviço.
**QA BRANCH / COMMIT:** candidata detached `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694` com WIP; nenhuma nova alteração de fonte nesta etapa.
**QA DEPLOYMENT:** Edge v5 lida; nenhuma publicação executada.
**REMOTE BUILD BUDGET / CONSUMED:** zero / zero; nenhuma chamada de deploy.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** este relatório e `artifacts/avatar-notifications-20261031/retention-diagnostic-deploy-manifest.json`.
**FUNCTIONAL RESULT:** causa exata do 503 ainda não confirmada; próximo passo delimitado e verificável.
**VISUAL / RESPONSIVE / ACCESSIBILITY / BROWSER:** não se aplicam a esta etapa documental; pendências anteriores preservadas.
**SECURITY:** sem valores/hashes de credenciais; JWT, RLS, identidade QA e gate fail-closed preservados.
**TESTS / BUILD:** não repetidos; AST/imports/SHA comparados em leitura. Evidências anteriores permanecem no relatório do setor.
**OBSERVABILITY:** códigos locais prontos, ausentes da fonte remota v5.
**OPEN FINDINGS:** bootstrap, prova real de retenção, agendamento, foto de cliente e consumidores ainda pendentes.
**PRODUCTION:** NOT TOUCHED.

| Ferramenta | Ação real | Evidência | Decisão |
|---|---|---|---|
| Supabase conector | Leitura da fonte/metadados Edge QA | v5, verify_jwt=true, bundle e lista de 10 arquivos remotos | Novo diagnóstico ainda não publicado |
| Node/TypeScript/filesystem | Grafo de imports e SHA-256 local/remoto | Manifesto durável de 11 arquivos | Pacote mínimo isolado, sem dependências externas |
| Web oficial Supabase | Conferência de secrets, migração, dependências e 503 | Links junto às afirmações | Não inferir troca automática da chave legada; manter autenticação |
| Shell em leitura | Checkpoint, runner e configuração | Registro histórico e limites do probe | Não repetir ativação nem inventar prova remota |
