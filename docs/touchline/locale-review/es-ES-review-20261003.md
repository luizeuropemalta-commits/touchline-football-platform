# Revisión estática de `es-ES` — 2026-10-03

## Alcance y límite de la evidencia

Revisión humana de las cadenas estáticas de `es-ES` en:

- `lib/touchlineArena/locale-catalogues/core-drafts.ts`
- `lib/touchlineArena/locale-catalogues/auth-drafts.ts`
- `lib/touchlineArena/locale-catalogues/market-drafts.ts`
- `lib/touchlineArena/locale-catalogues/rankings-drafts.ts`
- los catálogos estables de navegación, notificaciones, Market/notificaciones, Match Centre, hechos del partido, etiquetas de estadísticas/posiciones y niveles de carta.

Se excluyeron expresamente las frentes activas de Intro, Inbox y perfil. No se ejecutaron pruebas, build, navegador, dispositivo, API, base de datos ni se modificó ninguna cadena. Esta revisión no afirma validación por hablante nativo ni verificación visual, responsive o de accesibilidad.

## Veredicto por criterio

| Criterio | Estado | Evidencia y límite |
| --- | --- | --- |
| Cobertura estática de los cuatro borradores | PASS | Las cuatro fuentes contienen una columna/objeto `es-ES`; `market-drafts.ts` además cubre plurales y números con `Intl.PluralRules`/`Intl.NumberFormat("es-ES")`. No se ejecutó la comprobación de tipos ni se verificaron consumidores. |
| Fluidez general de español de España | BLOCKED | La mayor parte del texto es natural y localizada (por ejemplo, `Porterías a cero`, `Fueras de juego`, `Centro del partido`, `Preferencia guardada`). Los tres hallazgos concretos siguientes impiden aprobar la fluidez global. |
| Terminología futbolística/producto | BLOCKED | `bench` se traduce como `Plantilla del club` mientras `squad` es `Plantilla` y `gameBench` es `Banquillo del partido`; `bench` queda semánticamente confundido con plantilla, no con banquillo. En rankings se alterna `cartas` (`publishedCards`, `rankingTitle`) con `tarjetas` (`publishedRankingDescription`, `playerRankingSummary`, `topPlayerCards`, `fullPlayerRanking`, `officialTopTwenty`) para la misma carta de jugador. |
| Placeholders, números y plurales | PASS (estático) | Los placeholders revisados de `core-drafts.ts` preservan exactamente `{incoming}`, `{outgoing}`, `{count}` y `{total}`. Las funciones españolas de Market conservan los parámetros y tratan singular/plural (`Falta/Faltan`, `jugador/jugadores`, `carta/cartas`, `copia/copias`) con formato `es-ES`. Falta ejecución para demostrar cada ruta. |
| Marcas y nombres protegidos | PASS (estático) | Se conservan `TouchLine`, `Market Transfer`, `ClubOwner`, `ClubOwner Table`, `TouchLine Cards League` y `TouchLine XI`. El plan de ocho idiomas permite conservarlos. Esto no autoriza reintroducir una etiqueta pública obsoleta. |
| Fallback inglés | BLOCKED | `core-drafts.ts` deja `playerProfile: "PlayerProfile"` para `es-ES` (y las demás columnas). `PlayerProfile` no figura entre los términos protegidos del plan. Debe confirmarse si es nombre oficial; si no lo es, la corrección localizada es `Perfil del jugador`. |
| Persistencia, notificaciones y consentimiento | BLOCKED / fuera de evidencia | Los catálogos de notificaciones son presentación; no prueban consentimiento, inscripción de dispositivo, persistencia ni entrega. Esta revisión no tocó esas rutas. |
| Navegador, móvil/tablet, lector de pantalla y revisión nativa | BLOCKED / no ejecutado | No hubo renderizado ni revisión de hablante nativo, por lo que no se reclama cobertura de esos criterios. |
| Gate público y publicación | BLOCKED intencionado | `TOUCHLINE_COMPLETE_LOCALES` sigue limitado a `en-GB` y `pt-BR`; los catálogos adicionales declaran estado `draft`. Esta revisión no cambia ni recomienda abrir el gate. |

## Hallazgos accionables

1. **P1 — eliminar o justificar el fallback `PlayerProfile`.**
   - Fuente: `core-drafts.ts`, clave `playerProfile`.
   - Riesgo: texto en inglés visible en una interfaz española. Antes de editar, decidir si es un nombre de producto protegido. Si no lo es, usar `Perfil del jugador`, coherente con `openSelectedPlayerProfile`.

2. **P1 — fijar la semántica de `bench`.**
   - Fuente: `core-drafts.ts`, claves `bench`, `squad`, `gameBench`.
   - Riesgo: `Plantilla del club` no significa normalmente banquillo y entra en conflicto con el uso ya correcto de `Plantilla` para `squad` y `Banquillo del partido` para `gameBench`.
   - Reparación mínima: confirmar el contexto de la clave original. Si denota suplentes, normalizarla a `Banquillo` (o el término contextual aprobado); si denota plantilla, renombrar/ajustar el contrato de clave antes de cambiar la cadena.

3. **P2 — adoptar un único término para player cards en Rankings.**
   - Fuente: `rankings-drafts.ts`, objeto `es-ES`.
   - Riesgo: mezcla de `cartas` y `tarjetas` para el mismo objeto sin una distinción documentada.
   - Reparación mínima: decidir el término del glosario (la mayor parte del producto usa `carta`) y armonizar las cinco cadenas de rankings en una revisión de catálogo separada.

## Observaciones no bloqueantes

- `auth-drafts.ts` mantiene un registro formal y natural de España (`Correo electrónico`, `Contraseña`, `Revisa tu correo`); no encontré placeholder roto en la inspección estática.
- `market-drafts.ts` usa de forma coherente `carta`, `plantilla`, `contrato` y las marcas protegidas; las frases de contratación y liberación son comprensibles sin inventar reglas económicas.
- Los módulos estables revisados muestran traducciones futbolísticas españolas coherentes, incluidos `Goles`, `Asistencias`, `Penaltis`, `Fueras de juego`, `Tiros a puerta`, `Porterías a cero`, `Posición` y las denominaciones de niveles. La evidencia es de fuente, no de interfaz renderizada.

## Estado de liberación

**No apto para liberar `es-ES`.** Primero resolver los tres hallazgos de contenido, volver a comprobar forma/tipos y realizar revisión lingüística nativa y renderizada por las pantallas/estados autorizados. Nada de lo anterior habilita la locale pública, notificaciones ni una publicación.
