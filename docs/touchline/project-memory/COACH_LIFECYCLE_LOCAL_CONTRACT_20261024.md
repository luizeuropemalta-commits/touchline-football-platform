# Treinador: contrato local prospectivo de liberação e contratação

Data: 24/10/2026. Escopo: preparação local do item 14, sem ativação operacional.

## Estado e limites

### Atualização local 24/10/2026 06:06 CEST — revisão visual conectada, operação continua inativa

Foi acrescentada a ação opcional `releaseAction` ao zoom de treinador, ligada somente ao treinador pago e confirmado da coleção no ClubOwner/Arena. A ação abre `ClubOwnerCoachReleaseDialog`, com valor pago, taxa ordinária de 10%, devolução prevista de 90% e saldo projetado. A confirmação permanece sempre desabilitada, sem callback de escrita ou chamada de API. Catálogo público e seleção inicial não recebem essa ação. Conta, temporada, treinador, revisão e elegibilidade corrente delimitam a revisão; alterar elegibilidade oculta o diálogo. Oito idiomas preparados. Isso é revisão de contrato, NÃO liberação/contratação operacional. Os cinco gates abaixo permanecem pendentes.

Evidência focal: 14/14 testes (incluindo cinco da revisão e nove de zoom/superfícies) passaram, fc3e1d; lint dos cinco arquivos exit0 af244a; transpile isolado sem erro sintático f5b768 não substitui TypeScript global. Nenhum browser/QA/DB/transação/deploy executado. Pressão2 impediu abrir a candidata; porta3100 sem listener em bcf54c. Não afirmar que o botão já foi visto no Safari.

O domínio puro, o validador de respostas e um módulo inativo de recuperação somente leitura estão preparados localmente. Isso **não** significa que já seja possível liberar ou contratar um treinador no site. Não foi criada migração, RPC, endpoint, integração de hook ou interface operacional para esses comandos; nenhuma flag foi habilitada, nenhum dado real foi alterado e não houve publicação.

Fontes implementadas:

- `lib/touchlineFantasy/club-coach-lifecycle.ts`: comandos separados `release-coach` e `hire-coach`, elegibilidade e transições puras.
- `lib/touchlineFantasy/club-coach-lifecycle-response.ts`: validação estrita de recibos e snapshots, sem transporte ou persistência.
- `lib/touchlineFantasy/club-coach-lifecycle-recovery-server.ts`: fronteira local somente leitura, com repositório injetado e capability desabilitada por padrão; ainda sem adapter durável.
- `lib/touchlineFantasy/club-coach-recovery-decision.ts`: decisão pura de aceitação da recuperação; compara conta, temporada, geração e comando exato, sem hook, transporte ou alteração de estado.
- `lib/touchlineFantasy/club-acquisition.ts`: leitura de `coach: null` explícito somente para planos pagos; propriedade ausente, `undefined` ou contrato malformado continuam inválidos. Beta exige treinador.
- `tests/touchline-club-coach-lifecycle-response.test.mts`: nove casos focais do novo validador.
- `tests/touchline-club-coach-lifecycle-recovery-server.test.mts`: nove casos focais de autoridade, escopo, registro histórico, conflito, taxa/preço e deadline controlada, sem acesso real a armazenamento.
- `tests/touchline-club-coach-recovery-decision.test.mts`: nove casos focais de aceitação, preservação de snapshot mais recente, conflitos de revisão e fences de contexto/comando.

A leitura de vacância não autoriza uma operação financeira. Os guards do replacement antigo continuam rejeitando treinador nulo. Os jogadores, a formação e o histórico não podem ser removidos ou reconstruídos por inferência ao liberar o treinador.

## Fonte canônica de valores e taxas

`lib/touchlineFantasy/club-market-rules.ts`, versão `2026-10-18-release-ten-percent`, define a taxa de mercado de 10% e `quoteClubReturn(..., "ordinary")`. A liberação ordinária do treinador usa o valor pago do contrato original: taxa de 10% e retorno de 90%. Não usa as taxas de troca entre ClubOwners — 5%, 4% ou 2% conforme o plano — nem amplia para treinador exceções de devolução por saída da liga.

Os contratos e preços devem corresponder a `CLUB_COACH_VALUES`, em `club-acquisition.ts`. A contratação debita o preço canônico publicado do treinador, não um preço ou saldo fornecido pelo navegador. A política existente calcula percentuais com inteiros e arredondamento half-up; os preços canônicos atuais dos treinadores são divisíveis por dez, permitindo ao parser exigir exatamente 10%.

O domínio exige plano pago, mercado confirmado aberto, rodada não bloqueada e revisão exata. Essas condições ainda precisam ser revalidadas dentro da futura transação; validação no cliente não é autoridade.

## Contrato prospectivo: before, comando, autoridade e recibo

O chamador deve conservar o snapshot completo e confirmado anterior (`before`), junto ao comando pendente e seu escopo. A conta e a temporada esperadas precisam vir de autoridade verificada; são condições de correspondência, nunca seletores que autorizem acesso a outra conta.

O envelope aceito contém exatamente `ok`, `accountId`, `seasonId`, `state`, `receipt` e `replayed`. O comando liga ação, chave de idempotência, treinador e revisão esperada. O recibo e o snapshot resultante devem ter a revisão da operação, exatamente `expectedRevision + 1`.

- Liberação: o contrato de saída corresponde integralmente ao treinador de `before`; o novo treinador é `null`; valor pago, taxa e retorno são coerentes com o contrato original; saldo final é o anterior mais o retorno confirmado.
- Contratação: `before.coach` é explicitamente `null`; o contrato de entrada corresponde ao treinador solicitado e ao preço canônico; saldo final é o anterior menos a contratação confirmada.
- Em ambos: plano, jogadores e sua ordem/campos, recibos de aquisição e presença/valor da formação permanecem intactos. Valores são inteiros seguros e não negativos; o cálculo de conferência usa `BigInt` e rejeita overflow.

Essa aritmética verifica a resposta; não aplica saldo otimista. O parser é estrutural: não comprova autenticação, publicação da oferta, propriedade da transação ou commit durável.

### Replay e resultado incerto

`replayed: true` não dispensa nenhuma conferência. Um replay somente pode ser comparado ao `before` original usando o snapshot exato da revisão daquela operação. Um snapshot mais recente é rejeitado, mesmo se o saldo coincidir, porque outras operações podem ter ocorrido. Treinador ausente, treinador presente ou saldo atual isoladamente não comprovam o resultado de um comando anterior.

Sem prova suficiente, o resultado permanece pendente. É necessário um contrato durável de recuperação por chave; não repetir automaticamente a escrita nem transformar uma leitura atual em recibo histórico.

### Fronteira de recuperação preparada, ainda inativa

`readClubCoachLifecycleRecovery` exige capability explicitamente habilitada e contexto de cliente autenticado e temporada resolvida independentemente. O tipo de contexto não autentica ninguém: não pode ser construído com o JSON do pedido. Convidado, falha de autenticação, administrador, identidade inválida e divergência de conta/temporada não consultam o repositório.

Quando essas condições passam, o módulo faz uma única leitura pelo escopo congelado conta + temporada + chave. O registro prospectivo contém exatamente versão, conta, temporada, comando, `before` histórico e resposta da operação. A resposta passa pelo validador canônico com o comando exato; recuperação não recalcula nem reaplica a transação. O retorno confirmado pertence à revisão da operação, não necessariamente à coleção mais recente, e exige os fences do futuro cliente antes de aceitar um snapshot.

A leitura assíncrona tem deadline de **8 segundos**, usando `resolveServerReadWithin`. Somente `null` recebido de uma leitura concluída significa `not_observed`; timeout, erro ou registro inválido são `unavailable`. Ambos continuam sem resolução financeira: não geram escrita nem retry automático. Um resultado tardio não altera a resposta já devolvida.

Limites explícitos: a autenticação, a resolução da temporada e a preparação do adapter acontecem fora desse prazo e precisarão de orçamento próprio na futura integração. A chamada síncrona que inicia a leitura não é preemptível pelo timer. O timeout não cancela I/O já iniciado; eventual cancelamento depende do futuro adapter. Não existe adapter durável, schema, RPC ou endpoint conectado a esse módulo. Os testes injetam registros e não comprovam autenticação real, commit, concorrência ou durabilidade.

### Decisão pura de aceitação preparada, ainda sem integração

`decideClubCoachRecovery` compara a autoridade e geração retidas com o contexto atual, e o comando original com o comando ainda pendente. Reutiliza `parseClubCoachLifecycleResponse` para conferir a resposta histórica e seu `before`, sem um segundo parser de recibos ou novas regras financeiras.

Uma operação histórica válida pode ser confirmada com `snapshot.action = "preserve"` quando a coleção atual tem revisão maior: nesse resultado não há snapshot para substituir a coleção. Na mesma revisão da operação, o conteúdo completo precisa coincidir. A substituição somente é proposta quando a coleção atual coincide integralmente com o `before` original. Conflitos, ausência de resposta e mudanças de contexto/comando permanecem pendentes, sem autorizar retry ou escrita.

O futuro chamador autenticado continua responsável por manter autoridade e geração corretas e conservar o `before` imutavelmente desde o envio. O módulo não autentica, não persiste, não aplica o snapshot e não prova commit. O dispatcher de `useClubCollection.ts` permanece sem suporte aos comandos de treinador.

## Cinco gates restantes — todos pendentes

### 1. Contrato durável de operação, recibo e recuperação

Persistir e recuperar o escopo conta + temporada + chave de idempotência, o comando exato e sua operação/recibo. Conservar prova da revisão e do snapshot da operação, ou outro contrato durável verificável que não dependa de inferir o saldo antigo pelo snapshot mais recente. Definir conflitos de chave, replay e resultado incerto antes de conectar o cliente.

### 2. Transação atômica e verificação do armazenamento

Implementar operações separadas de liberação e contratação com ordem de locks compatível com os escritores existentes: QA → rodada → mutex de assinatura → coleção. Dentro da transação, conferir identidade, plano, mercado, bloqueio da rodada, revisão e oferta publicada; efetivar treinador, saldo, revisão, operação e recibo atomicamente. Resolver replay antes de reaplicar a transição. Preservar contratos de jogadores, alocações, formação, recibos e snapshots históricos/fechados. Exigir testes de concorrência, privilégios/RLS e plano de migração/rollback no alvo autorizado antes de qualquer ativação.

### 3. Adapter e endpoint autenticados com capability própria

Criar transporte limitado com identidade autenticada e temporada independente, origem e tamanho de corpo controlados, e conta esperada como guard. Falhas transitórias de autenticação não devem virar logout confirmado. Não aceitar preço/saldo do cliente nem chamar RPC inexistente. Expor capability específica de treinador, inicialmente desabilitada: a flag de liberação de jogador não autoriza treinador.

### 4. Comandos e recuperação no cliente

Integrar explicitamente `useClubCollection.ts`: tipo de comando pendente, dispatcher próprio, `before` completo e escopo conservados, parser antes de `acceptSnapshot`, fences de conta/temporada/geração e ausência de atualização financeira otimista. Timeout, resposta inválida ou falha de transporte mantêm incerteza; recuperação somente leitura por chave original, sem replay automático de POST. Um diário local de referências não é autoridade nem recibo e não substitui recuperação durável após reload.

### 5. Fluxo visual e comprovação ponta a ponta

Adicionar ação de liberar treinador no padrão dos jogadores, com confirmação de contrato/taxa/retorno, vacância real sem fallback legado e contratação no catálogo canônico somente quando o mercado permitir. Treinador não entra na troca interna entre ClubOwners. Preservar o XI na vacância, mas não confirmar escalação competitiva sem treinador. Validar no QA local com dados autorizados: recibo, saldo, persistência após reload, revisão/conflitos, acessibilidade, oito idiomas e desktop/mobile. Só depois considerar capability, publicação e gates de release separados.

## Pontos de integração que não podem ser reaproveitados sem alteração

- `components/touchline/fantasy/useClubCollection.ts`: `initialize` é inicialização de coleção inexistente, não contratação para uma coleção vaga. O dispatcher de retry atual não conhece os novos comandos; ampliar apenas a união de tipos pode encaminhá-los incorretamente para allocation.
- `app/api/touchline-fantasy/collection/initialize/route.ts`: bootstrap inicial não é operação de contratação posterior.
- `app/api/touchline-fantasy/collection/release/route.ts`: liberação de jogador, com identidade/recibo próprios, não liberação de treinador.
- `lib/touchlineFantasy/club-release-recovery*.ts`: padrões úteis de recuperação e escopo, mas o repositório atual lê recibos de jogadores. Não comprova comandos de treinador.
- `lib/touchlineFantasy/club-collection-server.ts` e `club-collection-read-server.ts`: disponibilidade atual de liberação é a de jogador; ainda não existe capability operacional de treinador.
- `app/fantasy/FantasyGameweekClient.tsx` e `components/touchline/cards/TouchlineCoachCardZoom.tsx`: não estão conectados a uma operação real de release/hire-coach.

A migração `20261017104205_club_collection_atomic_acquisition.sql` exige a chave `coach`, mas essa condição isolada não proíbe JSON `null`. Isso não torna vacância operacional: operações existentes restringem alterações do treinador. A migração `20261018051627_club_collection_atomic_release.sql` fornece um padrão transacional de jogador, não uma RPC de treinador; o armazenamento de recibos e a identidade de jogador não são intercambiáveis. A projeção de rodadas em `20261017105757_club_collection_round_projection.sql` também precisa integrar a regra de vacância sem alterar histórico fechado.

## Dependências futuras não implementadas

Este inventário é uma proposta técnica baseada na fonte local, não uma migração escrita ou aplicada. Nenhum schema, RPC, endpoint, adapter ou dado real foi alterado por ele.

1. **Publicação transacional da oferta ainda ausente no caminho inspecionado.** `lib/touchlineFantasy/server.ts:302–344` monta o catálogo a partir de `TOUCHLINE_LIVE_COACHES`, classificação TypeScript e `football_clubs`. O initialize recebe `p_coach` do servidor, mas não comprova publicação dentro da transação. Antes de implementar contratação atômica, definir uma ponte versionada e consultável transacionalmente a partir da fonte canônica aprovada. Não criar catálogo manual paralelo nem confiar em `published`, preço ou tier enviados pelo navegador. Sem essa decisão, a validação de oferta no gate 2 permanece aberta.

2. **Registro histórico e namespace de idempotência.** `touchline_club_collection_operations` guarda comando/revisão, mas não `before` nem resultado histórico. A menor extensão proposta é uma tabela privada de resultado de treinador vinculada à operação por `(user_id, season_id, idempotency_key)`, contendo versão, comando exato, `before` original, resposta/recibo e revisão. A coleção, a operação e o resultado devem ser gravados na mesma transação. Reusar o namespace existente detecta colisão também com comandos de jogador/alocação. Não adaptar `touchline_club_release_receipts`, que exige `player_id UUID`, ao ID de provedor do treinador. O replay da liberação atual de jogador retorna `v_current.state`; isso não satisfaz o resultado histórico exato exigido aqui.

3. **Duas operações e locks consistentes.** Propor RPCs separadas de liberação e contratação sobre `touchline_club_collections`, sem bootstrap ou orçamento novo. Reutilizar `touchline_club_lock_open_round`, `touchline_club_market_is_open` e mutex de assinatura, respeitando a ordem QA → rodada → assinatura → coleção. As referências são `20261017110218_club_market_five_minute_window.sql` e `supabase/qa/club_market_test_opening.sql`. O override QA não pode permitir alteração de treinador comprometido em rodada bloqueada/em andamento. Revalidar revisão, entitlement/plano, janela e contrato sob lock. Não chamar provider ou outro serviço durante a transação.

4. **Mutação mínima do estado.** Liberação usa o contrato pago e taxa ordinária de 10%, credita 90% e grava `coach: null`. Contratação exige vacância, oferta canônica publicada e saldo suficiente. Alterar somente `coach`, `balanceEur`, `revision` e `updated_at`; preservar jogadores, ordem/alocação, formação, recibos de aquisição e contratos históricos. Validar inteiros seguros, overflow e comando exato no banco. A constraint atual exige a chave `coach` e já admite JSON `null`; não é necessário relaxá-la para inventar vacância.

5. **Projeção competitiva e fronteira legada.** Conferir explicitamente a vacância em `touchline_club_project_lineup`/`touchline_club_save_lineup`; preservar o XI da coleção, mas não confirmar escalação competitiva sem treinador. `touchline_club_round_is_owned` já depende da correspondência do treinador. Manter imutáveis snapshots `LOCKED`/`FINAL` e `locked_coach_id`. Não liberar o endpoint legado `touchline_hire_coach_contract` para uma coleção vaga: o guard de `20261017125838_club_collection_legacy_checkout_boundary.sql` continua sendo necessário. Validar o predecessor real das funções transformadas por migrações antes de qualquer mudança futura.

6. **Privilégios e recuperação.** Preferir RPCs `SECURITY INVOKER` e acesso somente pelo servidor autenticado autorizado. Tabela privada com RLS; revogar explicitamente privilégios herdados também de `service_role`, concedendo apenas `SELECT/INSERT` no resultado histórico, sem alterar defaults globais. O padrão de hardening é `20261018150231_club_release_receipts_service_role_least_privilege.sql`. O futuro adapter de recuperação deve ler um resultado completo por conta/temporada/chave, sem reconstruir `before` a partir da coleção atual e sem repetir POST.

7. **Provas locais a reaproveitar, ainda não executadas para treinador.** Usar `tests/helpers/club-round-database.mts`, os testes de atomicidade/ACL de release, `tests/native/touchline-club-release-concurrency.test.mts` e os testes de projeção de rodada/vacância como infraestrutura. Acrescentar concorrência com mesma chave/chaves distintas, rollback se o registro histórico falhar, replay após reconexão e após outra operação, fechamento do mercado durante lock, alteração de entitlement, contratação sem saldo/oferta, bloqueio competitivo durante vacância e preservação do histórico fechado. O teste nativo exige banco descartável local e conexões reais; um teste de mock ou PGlite não substitui essa prova de concorrência. Nenhum teste remoto está autorizado por este plano.

Próximo gate: resolver a fonte transacional da oferta e aprovar o contrato histórico/locks antes de gerar uma migração forward-only. A preparação de SQL, sua aplicação, o adapter e a ativação continuam etapas separadas.

## Evidência desta preparação

- Execução informada pelo coordenador root: **19/19 testes passaram**, saída `baef1c`; o pacote inclui os **9 testes** do novo parser de recibos/respostas.
- Revisão independente informada pelo coordenador: **sem achados P1/P2** no módulo entregue.
- Nova execução informada pelo coordenador root: **35/35 testes passaram**, saída `9e1d8a`, incluindo os **9 testes de recovery** e os **9 testes independentes da apresentação IN/OUT**. O total do pacote não representa 35 testes exclusivos de treinador. A deadline foi exercitada com relógio controlado e resolução tardia, sem esperar oito segundos reais.
- Revisão independente do recovery por `pending_task_audit`: **nenhum P1/P2 concreto na fronteira inativa**. Foram conferidos escopo conta/temporada/chave, `before` histórico, comando/recibo/revisão/economia e timeout sem nova escrita ou substituição tardia; os limites de auth/setup, cancelamento e ausência de adapter acima permanecem. O revisor não executou testes adicionais.
- Execução posterior informada pelo coordenador root: **44/44 testes passaram**, saída `1017ee`, incluindo os **9 testes novos da decisão cliente**. Revisão independente de `loading_locale_review`: **nenhum P1/P2 concreto no helper puro**; confirmou os fences e decisões de preservar/substituir, mantendo a obrigação do futuro caller de preservar contexto e `before`. Nenhum hook ou operação foi habilitado por essa validação.
- Este documento não executou testes adicionais. Essa evidência é local e focal, não teste de banco, de concorrência real, de navegador, de publicação ou de uma operação financeira ativa.

O item de liberar/contratar treinador permanece pendente até completar os cinco gates. Nenhum checkpoint geral foi alterado por este documento.
