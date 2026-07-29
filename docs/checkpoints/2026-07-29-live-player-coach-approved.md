# Checkpoint aprovado — cards da Live e treinador

Data: 2026-07-29

## Estados aprovados

- Cards compactos dos jogadores na Live: `live-compact-approved-browser-20260729`
- Cards dos jogadores + editor mestre do treinador: `live-player-coach-approved-20260729`

## Regra de restauração

Restaurar somente os arquivos do componente afetado. Não usar reset geral do repositório.

### Jogadores da Live

```bash
git restore --source live-compact-approved-browser-20260729 -- \
  app/globals.css \
  components/touchline/cards/TouchlineEliteExactCard.tsx \
  tests/touchline-live-match-simulation.test.mts
```

### Card e editor do treinador

```bash
git restore --source live-player-coach-approved-20260729 -- \
  app/api/touchline-arena/coach-card-layout/route.ts \
  app/visual-qa/coach-card/page.tsx \
  components/touchline/cards/TouchlineCoachCard.module.css \
  components/touchline/cards/TouchlineCoachCard.tsx \
  lib/touchlineArena/coach-card-layout.ts \
  public/touchlineArena/card-layouts/coach-card-layout.json \
  tests/touchline-coach-card.test.mts \
  tests/touchline-neon-identity-regression.test.mts
```

## Configuração mestre do coach

- Versão do layout: `6`
- Chave: `touchline:coach-card:master-layout:v6`
- Bloco nome + clube: `y = 52`
- Bloco dados técnicos: `y = 65.5`
- Os dois blocos permanecem acima da pedra inferior.

