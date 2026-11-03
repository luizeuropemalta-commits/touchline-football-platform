# QA publicada — evidência Safari e Exchange
Data local: 01/11/2026. Ações de listagem/proposta em 31/10/2026 UTC.

## Escopo e sessão
QA: xgxbwqxjssxxuihuwmgy. URL estável touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app.
Candidata local separada; nenhum deploy novo neste lote.
Safari nativo recuperado escolhendo a janela existente. O estado anterior “sem conteúdo” deixou de ser o bloqueio; depois o Mac bloqueou e impediu continuar UI.
Contas CUSTOMER QA mutáveis autorizadas pelo usuário; ADMIN e Production não envolvidos.

## Fatos de interface
- Conta autenticada Luiz — QA 2, plano Standard, 35 jogadores, saldo 15.000.000 TC, validade30/05/2027.
- Foto indisponível; ranking e seguidores indisponíveis. Rodada41,19 e temporada0,00. A análise SQL própria está em AGENT_QA2_SCORE_READ_2026-10-31.md; não inferir perda de pontos.
- Mercado fechado; controles de substituição/Confirmar XI e liberação do card observado estavam desabilitados. Isso não prova que a flag release está efetiva; a regra de mercado também bloqueia a ação.
- Exchange carregou15cards próprios e8da outra conta. A frase fixa de integração pendente era obsoleta; removida apenas na candidata local com revisão/teste.
- Ethan Pinnock foi listado uma única vez pelo botão da UI; a confirmação mostrou Withdraw listing.
- Prévia de Pinnock3M por Virgil van Dijk15M: diferença-12M, taxa750.000, bônus375.000, saldo previsto2.250.000 TC.
- Confirmar criou proposta pending, PinnockReserved e opçãoCancel proposal. Não repetir a criação.

## Proposta persistida e continuidade
ID:94b7b46d-45f0-4456-b354-4346a5bc4c72.
Proponente:8f430e6a-cc9d-47df-b623-c5c0b4e5ab43 Standard revisão38.
Destinatário:072900f3-27fc-41a5-9881-6913a486754e VIP revisão81.
Temporada:1e83121b-b778-459b-b9a0-7cf1eaff5729.
Pinnock:3bc292fa-ef60-40b3-8c88-9b34a134b4d0, outside slot1.
Van Dijk:b24a8558-0c3d-4317-89f8-e3929453913b, outside slot3.
SQL posterior confirma pending, resolved_atNULL, zero recibos de liquidação; ambas coleções continuam35jogadores e revisões38/81. Saldos atuaisStandard15M eVIP1.143.060.000 TC.
Arquivo de evidência: artifacts/local-card-integrity-20261031/exchange-safari-proposal-proof.json.

## Próximo teste
Retomar sessão VIP autenticada, confirmar recebimento/termos e aceitar a proposta existente. Conferir saldoStandard2.250.000 eVIP1.155.435.000 TC, contratos trocados nos mesmos slots fora da partida, XI imutável, um recibo e idempotência. Esses números são expectativas, não resultados.
A queda do total de créditos deve ser375.000 TC. Não considerar teste completo antes do aceite e da propagação ao histórico/telas.
Se não continuar esse cenário, cancelar a proposta pelo fluxo previsto e confirmar liberação das reservas; não apagar registros.

## Outros limites
Nenhuma aprovação visual/mobile, retenção, foto, push, Exchange Beta, cancelamento/recusa ou rescisão foi obtida por esta inspeção.
Abrir nova janela Safari não confirmou a sessão VIP antes do bloqueio do Mac; não presumir que a segunda conta está autenticada.

## Atualização — aceite persistido e histórico visível

O próximo teste descrito acima foi executado em 01/11/2026. Pelo Safari nativo da sessão CUSTOMER VIP, a proposta existente foi aceita uma única vez em 05:28:38.52379 UTC. A resposta inicial ficou incerta na interface, mas o fluxo recuperou o resultado sem novo envio manual.

Readback da QA: proposta ACCEPTED; exatamente um recibo; zero reservas; 35 jogadores em cada coleção. Standard revisão39, saldo2.250.000TC, VanDijk outside1 e contrato15M; VIP revisão82, saldo1.155.435.000TC, Pinnock outside3 e contrato3M. Taxa750.000, bônus375.000 e retirada375.000TC. Esta é uma execução persistida, distinta do ensaio SQL com rollback anterior.

Safari VIP comprovou posteriormente o saldo1.155.435.000 e o cardPinnock. No Histórico de transferências apareceu o recibo com Luiz—QA2, data01/11/2026 05:28UTC, cardrecebidoPinnock3M, entregueVanDijk15M, diferença recebida12M, taxa0, bônus375.000 e saldo1.155.435.000TC. A primeira leitura mostrou indisponibilidade enquanto a requisição ainda carregava; uma nova observação, sem recarga, mostrou o recibo. Isso é defeito de estado de carregamento, não falha persistente de gravação.

Limites: ainda falta comprovar atualização visual da sessão Standard e demais cenários recusa/cancelamento/novas restrições Beta na candidata consolidada publicada. O novo layout e a terminologia Card são locais, não estão nesta versão QA observada. Não equivale a toda a matriz Exchange aprovada.

## Persistência CUSTOMER Standard — 2026-11-01, após aceitação

Janela normal Safari identificada como Luiz — QA 2 / Standard; a sessão antiga ainda mostrava estado anterior. Após Reload e reidentificação da janela, saldo 2.250.000 TC e Virgil van Dijk no grupo fora do jogo. Confirma persistência pelo consumidor da outra conta sem novo comando financeiro. VIP permanece conta CUSTOMER separada. Nenhuma Production alterada.
