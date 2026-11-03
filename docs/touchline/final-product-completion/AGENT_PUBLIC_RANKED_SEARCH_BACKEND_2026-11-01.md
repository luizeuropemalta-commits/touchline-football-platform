# Busca pública de ClubOwners por ranking — backend local

Estado: **VERDE LOCAL DELIMITADO; integração publicada pendente**. A revisão independente inicial não encontrou bloqueador concreto nos 13 arquivos do manifesto. O adendo de busca somente por nome abaixo substitui a regra inicial; tem manifesto próprio e revisão separada. Não houve aplicação de migração, publicação de perfis, ativação de configuração ou deploy na QA neste lote.

## Comportamento implementado

A mesma rota de busca aceita consulta vazia para listar os perfis que escolheram aparecer publicamente, em páginas de 20. A classificação vem do cálculo canônico dos pontos FINAL da temporada inglesa ativa. A ligação interna usa UUID de conta; nomes iguais não transferem a posição de uma pessoa para outra. A interface pública recebe apenas ID público, nome público, posição, seguidores, estado de seguir e foto autorizada pelo mecanismo existente.

Ao digitar o nome, o filtro considera todo o conjunto público permitido antes de paginar. Não limita a procura aos primeiros 20 resultados. Todas as palavras digitadas precisam aparecer como trechos do nome, em qualquer ordem, ignorando maiúsculas e acentos; `%` permanece literal. A caixa não resolve IDs públicos ou privados. O ID público continua exclusivamente como identidade de URL/ações, sem ser termo de busca. Perfis sem posição confirmada aparecem depois dos classificados, com rank nulo, sem inventar zero.

O cursor é ligado à consulta e ao snapshot dos IDs públicos, nomes e posições. Uma mudança que tornaria a próxima página inconsistente invalida a continuação com 400; o cliente deve reiniciar a primeira página. A atualização de seguidores, por si só, não muda o snapshot do cursor. Limites: 20 por página, 10.000 candidatos publicados, 100.000 linhas por fonte interna de ranking, 10 segundos compartilhados para leituras de dados e cursor de até 1.024 caracteres. Falha, limite excedido, resultado incompleto ou prazo excedido retornam indisponibilidade, sem ranking parcial nem falso estado vazio.

## Banco, privacidade e contrato

Migração local criada pela CLI: `supabase/migrations/20261101065616_touchline_people_ranked_directory.sql`. SHA-256: `9585b817062274044ad98bb357feb01c970ef17d8addff618f3a1661eedc875e`.

A função privada e seu wrapper são executáveis somente por service_role. Permanecem bloqueados para PUBLIC, anon e authenticated; não há novos grants de tabela. A função exige o gate existente e só devolve candidatos explicitamente publicados. Não liga o gate, não cria perfil, não altera consentimento e não escreve pontos. A identidade opcional do visitante vem de auth.getUser() verificado no servidor, com as condições existentes de conta autorizada; nunca vem do corpo ou query do cliente. Identificador interno, e-mail, saldo e elenco não saem no DTO HTTP.

`PublicOwnerSearchPage` contém `profiles: PublicOwnerSearchResult[]` e `nextCursor: string | null`. O parser restringe os campos e recusa forma inválida, duplicação de ID, rank inválido ou página maior que 20. Busca anônima pode ler somente perfis públicos; publicação e seguir continuam pelos RPCs autenticados existentes, com validação de origem e corpo. Foto mantém consentimento próprio separado.

As funções de standings foram extraídas para compartilhar a mesma projeção FINAL entre o cabeçalho, o ranking e a busca. A saída pública anterior continua omitindo UUID interno. Não foi criada fórmula concorrente nem alterado o critério de pontuação.

## Evidências

Manifesto exato e hashes: `artifacts/social-ranked-search-20261101/manifest.json`. Preimagens dos arquivos existentes: `preimage-manifest.json` e diretório `preimage`, com extensão `.preimage` para não entrar no TypeScript global.

| Verificação | Resultado | Limite da prova |
|---|---|---|
| Busca pura, handler, autenticação e standings existentes | 33 PASS / 0 FAIL / 0 SKIP | Log `focused.log`; não somar execuções sobrepostas |
| Adapter servidor, temporada e deadline/limites | 3 PASS / 0 FAIL / 0 SKIP | Log `adapter.log`; Supabase substituído por boundary local |
| RPC, ACL, gate, opt-in e limite em PGlite | 5 PASS / 0 FAIL / 0 SKIP | Log `sql.log`; banco local descartável, não QA |
| TypeScript restrito | 13 entradas, zero diagnósticos | `typecheck.log`; diagnósticos de dependências excluídos, não é aprovação global |
| ESLint | exit 0 em 12 arquivos TS/testes próprios | `lint.log` vazio |
| Whitespace do diff | exit 0 | paths próprios, sem reverter WIP |
| Revisão independente | Nenhum bloqueador concreto por fonte | `backend-independent-review.json`; revisor não repetiu testes |
| Browser / QA / persistência publicada | PENDENTE | Zero navegador, zero aplicação SQL e zero deploy neste lote |

A prova SQL ocorreu com bytes idênticos da migração antes da renomeação para o timestamp gerado pela CLI. Apenas o caminho do teste foi atualizado; não foi repetida a prova por essa renomeação. A criação local pela CLI não aplicou banco remoto.

## Integração restante e reversibilidade

O root integra o modal e seus entrypoints. A nova rota exige a migração no projeto QA correto, implantação da candidata e o gate/consentimento explícito dos perfis de teste. O gate de aplicativo efetivo já foi inspecionado em outro recibo; isso não prova que o gate do banco ou os perfis estejam ativados. O preparo anterior para ativação está em `artifacts/social-discovery-activation-20261101` e precisa ser conciliado com esta migração antes da execução.

Antes de aplicar, verificar target QA pelo conector, preimagem/ACL e funções presentes; não usar a simples passagem de um literal QA como comprovação de alvo. Após aplicar/deploy, conferir browse, busca por nome de duas contas CUSTOMER, retorno vazio para UUID colado, posição, foto consentida, seguir e falha controlada. Browser local e dispositivo real continuam separados; capacidade atual insuficiente está registrada no inventário, sem redução de limites.

Reversão local: retirar somente o delta desta missão usando as preimagens e hashes, preservando WIP de outros agentes. Reversão de exposição: desligar gate existente imediatamente; não apagar perfis, IDs ou histórico. Qualquer reversão SQL futura deve ser forward e coordenada com a versão do código; não foi executada nesta missão.

## Registro da missão

**MISSION:** busca pública por ranking e nome com privacidade e paginação consistente.
**SCOPE:** 13 paths do manifesto, migração apenas local, testes focados e evidências; UI pelo root.
**QA BRANCH:** candidata qa-stripe-release-20261029, detached.
**QA COMMIT:** base 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694; delta não commitado.
**QA DEPLOYMENT:** nenhum novo neste lote.
**REMOTE BUILD BUDGET / CONSUMED:** 0 consumidos.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** manifesto de 13 paths; documento e artifacts próprios.
**FUNCTIONAL RESULT:** verde local delimitado nos contratos/leituras/ranking/SQL; integração remota pendente.
**VISUAL RESULT:** não aprovado por este backend.
**RESPONSIVE RESULT:** pendente DOM/dispositivo.
**ACCESSIBILITY RESULT:** consumidor UI tem testes próprios, sem aprovação de navegador neste lote.
**SECURITY RESULT:** ACL, RLS, gate, opt-in, UUID interno e DTO público delimitados; nenhum segredo lido/copiado/exposto.
**BROWSER MATRIX:** nenhum navegador executado pelo agente neste lote; root coordena a capacidade.
**TESTS:** 33 focados, 3 adapter, 5 SQL locais; não representam aprovação integral do produto.
**BUILD:** não repetido; gate consolidado posterior pertence ao root.
**OBSERVABILITY:** logs, manifesto, preimagens e revisão independente preservados.
**OPEN FINDINGS:** aplicar/revisar migração QA, integração UI, gate/perfis consentidos, browser/QA/logs/persistência/regressão e build consolidado.
**PRODUCTION:** NOT TOUCHED.

| Ferramenta / plugin | Relevante | Carregada | Executada | Resultado | Evidência |
|---|---|---|---|---|---|
| Shell/Git | Sim | Sim | Sim | fontes, diff, hashes e verificação focada | manifesto e logs |
| TypeScript/Node | Sim | Sim | Sim | checks delimitados acima | focused/adapter/typecheck/lint |
| PGlite | Sim | Sim | Sim | ACL/RLS/gate/limites locais | sql.log |
| Supabase docs/CLI | Sim | Sim | Sim | referências oficiais de RLS/segurança; arquivo local criado pela CLI | migração e sessão de criação; sem apply |
| Revisor independente | Sim | Sim | Sim | nenhum bloqueador concreto | backend-independent-review.json |
| Safari/Vercel/QA SQL | Não para implementar este delta local | — | Não neste lote | sem prova remota | pendências explícitas |

## Adendo — busca somente por nome

Pedido posterior do usuário: buscar amigos pelo nome, sem pesquisar ID nem mostrar ID na lista. Este requisito substitui a resolução por ID e prefixo do primeiro lote. O backend agora combina trechos de todas as palavras do nome, ignorando acentos, maiúsculas e espaços repetidos; `silva joao` encontra `João da Silva`. Nome/ID interno não se confundem: um UUID colado não retorna o perfil por seu identificador. Nome escolhido, posição e permissões continuam sem alterações. A remoção visual de IDs na lista pertence ao componente do root.

Manifesto atualizado: `artifacts/social-ranked-search-20261101/name-only-manifest.json`. Cinco arquivos mudaram: contrato/copy, helper de filtro e três testes. A migração SQL, ranking, limites, DTO, consentimento e autenticação permanecem byte a byte iguais ao manifesto anterior. Não se repetiu SQL ou suíte ampla sem necessidade.

Verificação do adendo: `name-only-focused.log` contém 27 PASS / 0 FAIL / 0 SKIP; `name-only-typecheck.log` contém zero diagnósticos nos 13 inputs próprios; `name-only-lint.log` está vazio após os cinco paths alterados, e diffcheck passou. Há regressões para sobrenome/trecho fora da primeira página, palavras em ordem inversa, acentos, literal `%`, nomes parecidos, UUID público/privado sem resultado e cursor preso à consulta normalizada. Não somar estes 27 aos 33 anteriores como casos únicos. Revisão independente do delta concluída sem bloqueador concreto: `name-only-independent-review.json`, com cinco deltas esperados, preimagens íntegras e oito hashes/SQL preservados. O revisor não repetiu testes. QA e browser continuam pendentes.

## Adendo — plano confirmado para a borda da foto

O DTO público agora inclui somente `planKey`: `beta`, `standard`, `master`, `vip` ou `null`. Essa informação serve à borda da foto; não expõe saldo, cobrança, período contratado, e-mail ou UUID da conta. A publicação do perfil continua explícita, e a autorização de foto permanece separada. A copy de consentimento foi atualizada pelo root para mencionar o plano ativo. O parser do perfil próprio permanece sem esse campo adicional.

A fonte é `public.touchline_fantasy_entitlements`, no registro `fantasy_access`, com status `active`, início já atingido e fim ainda não atingido. Não se usa o plano salvo no elenco, em rodada antiga ou em metadados de cobrança. Registro ausente, período futuro/expirado, estado não ativo ou plano legado não confirmado retornam `null`, que a interface apresenta com borda neutra. Uma falha de leitura continua sendo indisponibilidade; não é convertida silenciosamente em Beta.

A migração **ainda não aplicada** ganhou o helper privado `current_public_plan(uuid)` e uma alteração da projeção protegida `profile(uuid)`. A busca e o retorno de seguir usam essa mesma projeção. O helper não pode ser executado diretamente por PUBLIC, anon, authenticated nem service_role. Não foram concedidos acessos novos às tabelas; o OID e a ACL da função de perfil existente são preservados. O vínculo usa a conta interna somente no servidor, sempre limitado a perfis publicados.

Cada leitura reflete o plano vigente no snapshot da requisição; não há promessa de atualização em tempo real de uma tela já aberta. O cursor agora inclui o plano confirmado na impressão do conjunto público. Se o plano mudar entre páginas, a continuação é invalidada e deve reiniciar, evitando apresentar bordas de snapshots incompatíveis. Contagem de seguidores continua fora desse vínculo do cursor. As respostas permanecem `private, no-store`.

Manifesto deste adendo: `artifacts/social-ranked-search-20261101/plan-colors-manifest.json`, SHA-256 `1390d80eb77a8ac27c99c68d09a545feff52edb21d917943fc6d544fc73f08a0`. Os sete hashes foram conferidos sem drift. Preimagens: `plan-colors-preimage-manifest.json` e `plan-colors-preimage/`. O SHA-256 atual da migração é `47f4911fa0f1e22211001ce8c2511ca8d720e1cbfd5ee9263b1a1f5fc8eeb003`, substituindo somente a versão local anterior registrada acima.

| Verificação deste adendo | Resultado | Limite |
|---|---|---|
| Contrato, busca, handler, sessão e adapter | 29 PASS / 0 FAIL / 0 SKIP | `plan-colors-focused.log`; não somar com execuções anteriores |
| SQL/ACL/RLS, quatro planos, validade e DTO | 6 PASS / 0 FAIL / 0 SKIP | `plan-colors-sql.log`; uma instância PGlite descartável, não QA |
| TypeScript restrito | 13 entradas / zero diagnósticos | `plan-colors-typecheck.log`; não é TypeScript global |
| ESLint e diffcheck | exit 0 | Seis arquivos TS/testes e os sete paths do adendo |
| Interface e navegador | PENDENTE | Os testes próprios da UI são separados; nenhum browser executado por este agente |
| Migração, perfis e flags remotos | NÃO APLICADOS | Nenhuma escrita na QA ou Production |

O log `plan-colors-focused-initial.log` preserva uma falha inicial de expectativa do adapter: o DTO agora normaliza campo ausente para `null`. A expectativa foi corrigida sem reduzir as verificações de identidade ou privacidade; a rodada final acima passou. A prova SQL cobre leitura direta negada do entitlement/helper, perfil oculto, gate fechado, plano vencido/inativo/futuro/legado e ausência de campos financeiros na resposta. A revisão independente final deste adendo é registrada separadamente, sem transformar testes locais em aprovação do produto publicado.

Revisão independente final concluída sem bloqueador concreto de fonte: `artifacts/social-ranked-search-20261101/plan-colors-independent-review.json`, SHA-256 `0317ee6c766b907254071bc9ff6ccf88378a777a3235e812668256ead73291dc`. O revisor conferiu os sete hashes e preimagens, ACL/proveniência/validade, consentimento, paridade profile/follow, DTO e cursor. Não repetiu testes nem aplicou SQL remoto.

**MISSION (adendo):** fornecer plano vigente confirmado para a borda pública, mantendo consentimento.
**SCOPE / FILES CHANGED:** sete paths do manifesto; UI e copy de apresentação pertencem ao root.
**QA BRANCH / COMMIT:** mesma candidata detached e base; delta não commitado.
**QA DEPLOYMENT / REMOTE BUILD CONSUMED:** nenhum / zero.
**FUNCTIONAL / SECURITY:** provas locais delimitadas acima; nenhum dado pessoal adicional no DTO.
**VISUAL / RESPONSIVE / ACCESSIBILITY / BROWSER:** sem aprovação remota ou de dispositivo por este lote.
**BUILD:** não repetido.
**OBSERVABILITY:** logs, preimagens e hashes preservados; revisão independente separada.
**OPEN FINDINGS:** revisar/aplicar migração na QA correta, executar gates consolidados e validar nome, ranking, plano, foto consentida e seguir no produto publicado.
**PRODUCTION:** NOT TOUCHED.

## Adendo — auditoria de integração e pendências de release

Auditoria somente de leitura concluída em 1 de novembro. Rastreado o caminho Header/Exchange → modal → GET paginado → ator verificado → RPC privado → ranking FINAL canônico → DTO público → foto consentida. Os sete hashes do adendo de plano continuam idênticos; trinta fontes/artefatos foram registrados no recibo `artifacts/social-ranked-search-20261101/integration-release-audit-20261101.json` (SHA-256 `0b188989ecd91f8056ebdc0972555b14d06d2d0057a069fe86e43bcb06dfc441`). Nenhum novo defeito concreto foi encontrado nos helpers de busca autorizados; não houve alteração de produto nem repetição de testes.

**Pendências concretas:**

1. O envelope histórico `social-discovery-activation-20261101/enable-qa-gate.sql` valida definições antigas de `profile`, `own_profile` e `save_profile`. A migração de ranking substitui a primeira e a de consentimento de foto substitui as outras. Portanto, depois dessas instalações o envelope antigo rejeita corretamente a preimagem. Preservá-lo como evidência; preparar e revisar outro envelope com definições finais e estado QA atual. Ele também exige gate desligado e zero perfis, condições que esta auditoria não voltou a consultar.
2. O GET novo depende de `touchline_people_directory_candidates` e devolve página/cursor com rank e planKey. Código, migração e consumidores precisam ser publicados como um conjunto coerente. Código novo sem a função falha com 503; páginas antigas abertas não são prova do contrato novo. Conciliar primeiro o histórico de migrações remoto e aplicar somente o que faltar.
3. Gate do aplicativo, gate do banco, consentimento de perfil, consentimento de foto e configuração de leitura/retenção são condições independentes. Falta comprovar o conjunto no deployment exato e nas duas sessões CUSTOMER autorizadas. Nenhum perfil privado deve ser publicado por conveniência.
4. A visita pública atual entrega identidade, foto, seguidores e seguir. Ainda não entrega o elenco/mercado da outra conta ou ação de proposta, e não mostra rank nessa página individual. O link “Meu ClubOwner” é da própria conta visitante. A busca não encerra esse requisito maior; mantê-lo como tarefa separada com projeção pública e permissões explícitas.

Ordem de integração: conferir alvo/histórico/ACL atuais da QA → conciliar as três migrações listadas no recibo → preparar o novo envelope de ativação/reversão → consolidar código e gates locais/SHA → publicar uma versão QA autorizada → conferir configuração efetiva → usar consentimento nas contas de teste → comprovar fluxo no navegador, logs e persistência. A sequência respeita os gates de exposição; não habilitar cedo para contornar a preimagem antiga.

Notas delimitadoras: Beta aparece após os classificados quando não pertence ao ranking pago canônico, com rank nulo. O RPC público legado de busca ainda aceita ID, mas não é chamado pelo GET novo de nomes. Atualizações de plano invalidam cursor entre requisições; uma tela aberta não recebe promessa de push em tempo real. Leituras têm orçamento e retornam indisponibilidade em vez de dados parciais. A latência total de autenticação/dados/foto deve ser conferida no ambiente publicado, pois seus prazos podem se somar ao timeout do consumidor; isso é cenário de integração pendente, não timeout comprovado.

**MISSION:** auditoria da integração social e manifesto de aplicação.
**SCOPE:** leitura local de 30 fontes/artefatos; nenhum produto alterado.
**QA BRANCH / COMMIT:** qa-stripe-release-20261029 detached; base 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694 com WIP preservado.
**QA DEPLOYMENT / REMOTE BUILD BUDGET CONSUMED:** nenhum / zero.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** este adendo e recibo JSON de auditoria.
**FUNCTIONAL / SECURITY:** encadeamento e fronteiras coerentes por leitura; quatro pendências delimitadas acima.
**VISUAL / RESPONSIVE / ACCESSIBILITY / BROWSER:** não executados nem aprovados nesta auditoria.
**TESTS / BUILD:** provas anteriores reutilizadas sem rerodar ou somar execuções; nenhum teste/build novo.
**OBSERVABILITY:** hashes atuais e ausência de drift registrados; nenhum log remoto consultado.
**OPEN FINDINGS:** envelope novo, SQL/código coordenados, configuração/consentimento e prova publicada; visita ao elenco/Exchange permanece tarefa de produto.
**PRODUCTION:** NOT TOUCHED.

| Ferramenta | Executada neste adendo | Evidência / decisão |
|---|---|---|
| Shell/Git/Python | Sim | leitura, identidade, hashes e recibo local |
| Testes/TypeScript/build | Não | evidências existentes preservadas, sem nova aprovação |
| Supabase remoto/Vercel/navegador | Não | integração publicada continua pendente |
