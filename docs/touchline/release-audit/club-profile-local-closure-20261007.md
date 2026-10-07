# Perfil de clube — fechamento local delimitado

2026-10-07. Página pública `/touchline-clubs/[club]`, amostra Arsenal, apenas em snapshot local sem `.env*`. Não houve mudança em fonte canônica, banco, contas, dados ou publicação; os seis idiomas novos continuam atrás do gate.

## Evidência

O renderer real foi montado por fixture privada com opt-in local. A inspeção em Chromium cobriu oito idiomas × desktop/tablet/telefone horizontal × hero com identidade/troféus, liga oficial e dia de jogo: 72 PNGs em `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/club-profile-2026-10-07T13-34-46-312Z` (árabe) e `club-profile-2026-10-07T13-35-04-627Z` (demais sete). Zero erros de página, overflow horizontal ou requisições inesperadas; nenhuma escrita externa. Root inspecionou diretamente AR phone nas três áreas, DE phone hero, FR tablet matchday e TR desktop liga, sem corte observado. O nome e escudo oficiais do Arsenal e nomes de troféus não foram traduzidos.

O snapshot sem dados remotos mostrou corretamente estados de próximo jogo/posição/XI ainda não confirmados, técnico/bench e elenco indisponível. Não é prova de atualização Sportmonks, cards publicados ou escalação real. O fixture cobriu um clube representativo, não os 20 perfis individualmente. O estado com dados reais e interações autenticadas continua para QA.

Oito suítes focadas de cópia, ordem, linha/roster, RTL, status e estrutura visual passaram 49/49, zero falhas e zero skips. Elas incluem a regra de ocultar valor comercial no perfil público. Servidor local encerrado.

Fechamento **local nos estados sem dados e no layout amostrado**; não é aprovação hospedada. Próxima página: perfil de jogador.
