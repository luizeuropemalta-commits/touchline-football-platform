# Inventário de mídia da Arena legada — 2026-10-07

Escopo somente leitura: arquivos de `public/touchlineArena/arena`, constantes de `lib/touchlineArena/arena-intro.ts`, consumidores atuais de entrada/vídeo/áudio. Nenhum arquivo removido/movido, nenhuma faixa extraída, nenhum navegador/build iniciado. Única escrita: este recibo.

## Resultado principal

O loop das três câmeras é **um único MP4**, não três arquivos. A imagem da antiga Arena pode ser legada, mas esse MP4 **ainda fornece o áudio ambiente atual**. Nenhum dos três assets inventariados pode ser classificado hoje como sem uso.

| Arquivo em `public/touchlineArena/arena/` | Bytes | Uso atual | Tratamento |
| --- | ---: | --- | --- |
| `touchline-arena-entry-20260716.mp4` | 27.554.402 | Intro atual, fundo cinematográfico de autenticação e áudio das rotas de autenticação | Preservar |
| `touchline-arena-loop-20260716.mp4` | 19.788.552 | Fonte do áudio ambiente nas rotas públicas permitidas, inclusive ClubOwner | Preservar até decisão/migração explícita do áudio |
| `touchline-arena-poster-20260722.jpg` | 338.023 | Poster/fallback da intro e autenticação, proxy e outros consumidores | Preservar |

Total: **47.680.977 bytes**. Manifesto de assets atualmente sem uso e elegíveis à retirada imediata: **vazio**.

## Um loop, três passagens

`lib/touchlineArena/arena-formation-video-layout.ts:7–23` declara `wide-touchline`, `lower-stand`, `side-sweep` e documenta explicitamente um único loop. Limites proporcionais usam duração21,025s: primeira passagem0–10s, segunda10–14,7s, terceira14,7–21,025s. Busca atual por import do módulo encontrou somente `tests/touchline-arena-433-video-layout.test.mts`; não há consumidor de aplicação atual encontrado. Isso caracteriza o módulo de geometria como candidato à revisão de legado, **não autoriza exclusão do MP4 compartilhado**.

Inspeção binária somente leitura dos atoms MP4 `moov/trak/mdia/hdlr/mdhd`, sem decodificar/extrair mídia:

- entry: uma track `vide`29,456315s e uma `soun`29,418667s.
- loop: uma track `vide`21,025s e uma `soun`20,992s.
- Poster: JPEG1600×900.

Esses dados provam estrutura/duração e existência de faixa sonora, não qualidade perceptiva nem reprodução real. `ffprobe` não estava disponível; não foi instalado. A afirmação de três passagens vem do contrato do módulo, não de nova visualização do vídeo.

## Cadeia ativa preservada

1. `lib/touchlineArena/arena-intro.ts:8–10`: constantes entry/loop/poster; loop usa query de versão `?v=202607170155`, sem corresponder a outro arquivo físico. O mesmo módulo guarda logo oficial, chaves de conclusão, intenção/timeline da intro e navegação inicial; não é módulo descartável por conter a palavra Arena.
2. `app/intro/page.tsx` → `TouchlineGameEntry.tsx:61`: vídeo **entry**, sem loop; conclusão/skip navega para `/clubowner` (linha34). Preservar essa intro atual e sua experiência aprovada.
3. `TouchlineArenaIntro.tsx:114`: poster CSS e logo oficial; `touchline-arena-intro.module.css:45` usa o poster como background.
4. `components/auth-cinematic-media.tsx:25–37`: entry como vídeo visual muted/autoPlay/loop, poster fallback, com preferência de redução de movimento. Consumido pelo `auth-layout.tsx:45` quando cinematic ativo.
5. `components/auth-ambient-audio.tsx:23–27`: provider escolhe **entry** para route=`entry` e **loop** para demais rotas permitidas. Atribui `audio.src` no play (linhas46–49), elemento `<audio loop preload="none">` na linha110. Portanto remover o loop quebraria áudio atual, mesmo sem `<video>` desse loop na UI nova.
6. `lib/touchlineArena/ambient-audio-policy.ts:4–10`: login/register/forgot/reset usam entry; `/arena` usa arena; touchline-clubs/coaches/players, rankings, touchline-player-card-rankings, live, clubowner, my-club usam public; administrativas/desconhecidas silenciosas. `/intro` não inicia som ambiente paralelo por essa política; seu vídeo tem controle próprio.
7. `app/layout.tsx:99–101` monta o provider, desabilitado em preview isolado. Controles atuais: `TouchlineGlobalNavigation.tsx:165` e `TouchlinePageControls.tsx:16`.
8. Outros consumidores diretos do poster: `proxy.ts:123` (background), `app/visual-qa/touchline-shirt-type/shirt-type.module.css:18` e `lib/touchlineArena/social-match-preview-live-replay-draft.ts:123`. Não são prova de poster obsoleto.

## Condição necessária antes de retirar o loop

É necessária decisão explícita de preservação/migração do áudio. Se autorizada uma separação de faixa, a futura mudança deve preservar timbre/conteúdo, duração/loop, volume/attenuation, consentimento por gesto, preferência de movimento, pausa/pagehide/freeze, propriedade única de áudio e exclusão sonora durante intro; trocar somente a fonte não dispensa teste de reprodução/continuidade. Nenhuma extração ou mudança foi realizada neste inventário.

Não remover o diretório inteiro, `arena-intro.ts`, entry ou poster com base no nome Arena. Preservar assets e recibos até um manifesto exato de remoção autorizado. Qualquer retirada no Mac deve continuar recuperável pela Lixeira, sem esvaziamento.

## Integridade SHA256

```text
6353b67c34213302469442c57c86d900cb8ed6ad3b6ec81edfc7b49bb1bd4ccb  touchline-arena-entry-20260716.mp4
74c24fc132e5cecbc280dd60da12542db7a7188a48156541eb396eabb599be02  touchline-arena-loop-20260716.mp4
5c31a22a79f54aac7483cf8a991e555a311cddff07be940c02cc7c0102239c19  touchline-arena-poster-20260722.jpg
```

Evidência produzida por `rg --files`, buscas de consumidores em app/components/lib/tests, `stat`, `file`, `shasum -a 256` e leitura binária Node dos headers MP4. Sem execução de testes, acesso a banco, rede ou build. Inventário não equivale a aprovação de remoção/deploy.
