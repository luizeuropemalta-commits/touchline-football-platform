# Notificações — fechamento local delimitado

2026-10-07. `/notifications`, cliente real com seis idiomas de rascunho habilitados apenas por fixture privada no snapshot sem `.env*`. Cada GET de `/api/notifications/preferences` recebeu 503 sintético; todas as demais escritas e rede externa foram bloqueadas. Nenhuma permissão, preferência, inscrição, aparelho ou entrega real foi alterada.

Oito idiomas × desktop/tablet/telefone horizontal: 24 capturas de página completa em `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/notifications-2026-10-07T14-01-59-302Z`, com 24 leituras sintéticas, zero erros de página, overflow, escrita ou rede inesperada. A imagem AR phone revelou direção LTR fixa. Correção canônica limitada ao `dir` do conteúdo por locale. Só os três tamanhos árabes foram recapturados em `notifications-2026-10-07T14-03-48-284Z`; AR phone inspecionado diretamente com leitura e controles RTL, sem corte observado.

Três suítes focadas: 15/15 PASS, zero falhas/ignorados, incluindo consentimento não inferido, GET/PUT protegidos, catálogos e plurais. `tsc --noEmit --incremental false`, ESLint escopado e `git diff --check` PASS. Não comprova preferências persistidas, permissão do aparelho, inscrição exata, aceitação de provedor ou recebimento. Servidor encerrado.

Fechamento **local da apresentação indisponível e do RTL árabe**. Próxima superfície: entrada raiz e retorno de autenticação.
