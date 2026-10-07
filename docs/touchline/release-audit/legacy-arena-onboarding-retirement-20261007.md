# Retirada do onboarding legado da Arena — 2026-10-07

Escopo autorizado e exclusivo: `lib/touchlineArena/arena-onboarding.ts`, `tests/touchline-arena-onboarding.test.mts`, `tests/touchline-auth-retired-destinations.test.mts`, mais este recibo. Nenhuma mídia, componente de intro, autenticação, banco, configuração ou publicação alterada.

## Dependências imediatamente verificadas

Antes das alterações, busca em app/components/lib/tests/scripts encontrou `observeTouchlineArenaOnboardingPlayback` e `touchlineArenaOnboardingHref` somente em suas definições e nos dois arquivos de testes do manifesto. Nenhum consumidor de aplicação. `components/auth-form.tsx:17` continua importando o helper ativo `touchlineRegistrationEntryHref`.

Após a retirada, a mesma busca pelos dois exports e `ONBOARDING_PLAYBACK_MS` retornou zero ocorrências em fonte/testes/scripts. `git diff --check` dos três arquivos exit0.

## Mudanças delimitadas

- Removidos observer de3s, constante, tipo auxiliar e helper antigo de destino `touchlineArenaOnboardingHref`.
- Mantido `touchlineRegistrationEntryHref` **byte a byte idêntico ao preimage**; preserva `/intro?intro=first&onboarding=market` e destinos administrativos/QA especiais. Marcador atual não foi alterado fora do escopo.
- Removidos apenas os testes exclusivos da funcionalidade morta. Testes reais de cadastro, normalização de retorno, login/OAuth/confirmação/recovery e destinos atuais continuam.
- Mudanças preexistentes de `/market-transfer` para `/clubowner` foram preservadas; backup captura exatamente o estado recebido, não HEAD antigo.

## Recuperação dos originais

Antes de editar, cópias exatas dos três arquivos foram guardadas em diretório único:

`/Users/luizlopez/.Trash/touchline-onboarding-retirement-20261007.zmX4ZB/`

Estrutura relativa original preservada (`lib/touchlineArena/…`, `tests/…`); `cmp` confirmou identidade de cada cópia antes do patch. Não foram apagados arquivos inteiros nem esvaziada a Lixeira. Para recuperação, comparar/copiar o arquivo específico dessa pasta para o caminho relativo correspondente no repositório, após verificar alterações posteriores; não sobrescrever trabalho novo cegamente.

| Arquivo | SHA256 original recuperável | SHA256 após retirada |
| --- | --- | --- |
| lib/touchlineArena/arena-onboarding.ts | a87756909bada8fa183444fae96c56077e8eff2fb2a22c54d15df4043fcbd13e | 956e69649c0c66c48554343c42c3684fa5a34702fda484d76bb4f96b4d705c6c |
| tests/touchline-arena-onboarding.test.mts | c82a97115921f866cd40787ce1c5f6a9176c7e65e65a1192d01bb4c3f6282b7a | d7aeb7691c95ad1062cfa2d8aea9181982554841085fdccebfb6f74292566139 |
| tests/touchline-auth-retired-destinations.test.mts | eb2ccdd3455a9fed6c605741e7f9d3183347390a431e3766e3b162999d27e49c | 754c5d117d63d693fb6549cd921f275a55edcbe5b1ff717b3d2986d2d1d94241 |

## Evidência focada, em slot serial autorizado

```sh
node --experimental-strip-types --test tests/touchline-arena-onboarding.test.mts tests/touchline-auth-retired-destinations.test.mts tests/touchline-game-entry.test.mts tests/touchline-arena-intro.test.mts
```

Exit0, **26 PASS, 0 FAIL, 0 SKIP, 0 cancelled**, duração reportada370ms. Distribuição: onboarding5, destinos9, game-entry3, intro9. Slot liberado imediatamente.

Contagem retirada, separada dos aprovados: onboarding tinha20 casos; **15 aposentados** (14observer e1helper), restam5 ativos. Destinos conserva seus9 casos e perde somente uma asserção do helper morto. Não apresentar esses15 como testes aprovados nem comparar totais de suites antigas sem explicar a aposentadoria.

Nenhum browser/build/full-suite foi executado nesta frente. Revisão independente solicitada; root controla integração e gates posteriores. Esta evidência confirma a retirada localizada e preservação coberta pelos26 testes, não aprovação de deploy.
