# Recuperação de senha — fechamento local delimitado

2026-10-07. Página `/forgot-password` apenas. Os seis idiomas adicionais permanecem em prévia privada; nenhuma alteração em produção, conta, senha, token, e-mail ou preferência.

## Fonte e comportamento

O formulário real já consumia as oito cópias em prévia e mantinha a rota pública com gate EN/PT. A revisão encontrou uma lacuna de anúncio: a mensagem de recuperação (sucesso ou indisponibilidade) era um `div` sem semântica de status/alerta. `components/auth-form.tsx` agora usa `role="status"` para sucesso no modo forgot e `role="alert"` para erro nos modos forgot/register; Login conserva sua semântica anterior. O texto e o fluxo de recuperação não mudaram.

O teste existente `touchline-password-recovery.test.mts` valida que o callback exige intenção assinada vinculada a e-mail/navegador, a concessão é curta e vinculada ao usuário, e a troca de senha só ocorre após revalidação. O teste AuthForm/rotas de prévia valida as oito cópias e o gate público. O teste focado de acessibilidade exige a semântica nova. Suítes focadas: 18/18 PASS, 0 skip/fail; o teste de interação de Cadastro afetado pelo componente compartilhado também passou 1/1, 0 skip/fail. TypeScript, ESLint escopado e diff-check passaram.

## Render e limites de isolamento

Em snapshot descartável sem `.env*`, a rota local `locale-forgot-fixture-local` chama o renderer real com opt-in apenas para imagens. A matriz inicial/serviço indisponível sob `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/forgot-2026-10-07T13-00-51-796Z` contém 32 PNG: oito idiomas × desktop/tablet/phone-landscape no estado inicial e oito erros desktop. Saída: zero erro de página, overflow horizontal ou requisição inesperada. Root inspecionou diretamente AR phone, DE tablet e FR desktop erro.

Para inspecionar o estado de sucesso **sem enviar e-mail**, o snapshot substituiu o cliente de recuperação somente na rota fixture; Playwright respondeu localmente ao POST da intenção, sem executar servidor/API real. EN desktop está em `forgot-2026-10-07T13-04-08-965Z`; os outros sete desktops em `forgot-2026-10-07T13-04-17-986Z`; AR/FR/DE phone-landscape em `forgot-2026-10-07T13-04-46-957Z`. Todos concluíram sem erro de página ou requisição não prevista. Após a correção semântica, EN/AR erro e sucesso foram repetidos em `forgot-2026-10-07T13-05-44-506Z` e `forgot-2026-10-07T13-05-55-838Z`, comprovando as regiões de alerta/status montadas. Root inspecionou AR e DE phone sucesso: mensagens visíveis, sem corte ou inversão física do layout. Nenhuma confirmação sintética prova recebimento por e-mail.

Isto fecha a **página local** nos estados e dimensões acima, não o fluxo hospedado ponta a ponta. QA com conta/entrega real, revisão independente do conjunto, suíte completa da candidata e autorização de produção são gates separados. O servidor local isolado foi encerrado. Próxima página do roteiro: redefinição de senha, antes de avançar para outra área pública.
