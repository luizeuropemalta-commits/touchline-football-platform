# Definir nova senha — fechamento local delimitado

2026-10-07. Página `/reset-password` somente. Os seis idiomas adicionais continuam em prévia privada; nenhum deploy, atualização de senha, e-mail ou chamada externa foi realizado.

## Correção e testes

`components/reset-password-form.tsx` mantém o texto traduzido no botão durante o envio; o indicador de espera fica oculto da árvore acessível. Os testes focados de recuperação e acessibilidade passaram 9/9, sem falhas nem ignorados. TypeScript, ESLint escopado e `git diff --check` passaram.

## Render isolado

Em snapshot descartável sem `.env*`, uma fixture local renderizou a página real com oito idiomas. O navegador interceptou a leitura do token de recuperação e, no estado de sucesso, a escrita: ambas receberam respostas sintéticas locais. Qualquer outra escrita ou chamada externa foi bloqueada. Nenhuma senha real foi alterada.

- Desktop: 24 capturas (oito idiomas × link válido, expirado e confirmação sintética). Saídas em `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/reset-2026-10-07T13-08-03-391Z` e `reset-2026-10-07T13-08-25-904Z`.
- Tablet e celular horizontal: 16 capturas do formulário pronto (oito idiomas × dois tamanhos), em `reset-2026-10-07T13-09-23-170Z`.
- Celular horizontal, textos mais longos: seis capturas de link inválido/confirmação em árabe, francês e alemão, em `reset-2026-10-07T13-12-12-680Z`.

As quatro execuções terminaram sem erro de página, overflow horizontal ou requisição inesperada. Inspeção direta confirmou árabe RTL no celular, alemão no tablet, francês inválido no desktop e árabe/alemão nos estados finais mobile, sem cortes observados. O servidor isolado foi encerrado.

Isto fecha a página **localmente** nos estados e tamanhos listados. Não comprova redefinição real ou fluxo hospedado. QA, revisão independente do conjunto e gates de produção permanecem separados. Próxima página: seguir o inventário das 16 telas do usuário, sem abrir administração.
