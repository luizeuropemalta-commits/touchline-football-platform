# Intro — fechamento local delimitado

2026-10-07. A rota pública mantém EN/PT e o gate dos seis idiomas adicionais fechado. Nenhuma fonte canônica, mídia, conta ou publicação foi alterada nesta revisão.

## Comportamento

As cinco suítes focadas de Intro, mídia, composição e navegação passaram 24/24, zero skips/falhas. A página real usa o vídeo/poster oficial e não recoloca os três loops aposentados. O slogan aprovado permanece em inglês, inclusive nos demais idiomas, por decisão de marca. O fluxo de primeira entrada, retorno e pular preserva o destino ClubOwner e a chave de conclusão.

## Browser isolado

Em snapshot local sem `.env*`, foi criada uma rota fixture privada que monta `TouchlineGameEntry` real com opt-in somente nessa cópia. Browser Chromium com rede externa/escrita bloqueadas capturou a fase do slogan em oito idiomas × desktop/tablet/telefone horizontal: 24 PNGs em `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/intro-2026-10-07T13-28-23-426Z` (árabe, 3) e `intro-2026-10-07T13-28-32-031Z` (outros sete, 21). Resultado: 24 capturas e 24 ações de pular com destino contendo o locale exato e conclusão local registrada; zero erros de página, overflow horizontal ou requisições inesperadas. Root inspecionou diretamente árabe no telefone, alemão no tablet e francês no desktop: controles legíveis e sem cortes observados. Vídeo foi bloqueado pelo harness antes da revelação; sua presença/identidade é coberta pelos testes focados, não por prova de reprodução audiovisual real.

A primeira tentativa usou `/intro?lang=` no snapshot e recebeu EN para os seis drafts: isso é o gate público esperado, não defeito de propagação. A fixture separada removeu essa limitação sem mudar o código público. O servidor foi encerrado.

Isto fecha somente a apresentação/controle local da Intro nos estados e dispositivos acima. QA hospedado, reprodução real da mídia em todos os navegadores, revisão independente do conjunto, persistência de conta e liberação de idiomas permanecem gates separados. Próxima página da sequência: diretório de clubes.
