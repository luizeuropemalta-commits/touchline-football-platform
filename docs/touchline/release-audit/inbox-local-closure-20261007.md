# Inbox — fechamento local delimitado

2026-10-07. `/inbox`, renderer real em fixture privada do snapshot sem `.env*`, com fonte de mensagens sintética vazia ou indisponível. Não leu conta real, banco QA/produção, recibos de leitura nem enviou aviso.

Oito idiomas × desktop/tablet/telefone horizontal × dois estados: 48 capturas em `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/inbox-2026-10-07T13-57-05-764Z`, zero erros de página, overflow, escrita ou rede inesperada. A inspeção AR phone revelou defeito concreto: o contêiner fixava `dir=ltr` e a seta de retorno apontava para a esquerda. Correção canônica limitada a direção por locale, seta RTL e alinhamento lógico do aside. Somente os seis cenários árabes afetados foram recapturados em `inbox-2026-10-07T13-59-04-936Z`, sem erros; imagem AR phone inspecionada com início à direita e retorno adequado.

Quatro suítes focadas: 17/17 PASS, zero falhas/ignorados, após atualizar a expectativa antiga de LTR fixo. `tsc --noEmit --incremental false`, ESLint escopado e `git diff --check` PASS. A suíte também usa dados editoriais sintéticos para comprovar literalidade e proteção de links; a matriz visual não comprova mensagens reais, preferência/recibo persistido ou QA. Servidor encerrado.

Fechamento **local dos estados vazio e indisponível e do RTL árabe**. Próxima superfície: notificações.
