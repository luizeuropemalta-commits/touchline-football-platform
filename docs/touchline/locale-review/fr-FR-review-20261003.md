# Revue statique fr-FR — 2026-10-03

## Portée et limite

Revue de copie statique limitée aux entrées `fr-FR` actuellement présentes dans :

- `lib/touchlineArena/locale-catalogues/{core,auth,market,rankings}-drafts.ts` ;
- modules de présentation existants hors des fronts Inbox, Intro et profil joueur : match facts, ClubHub, navigation, Live, table officielle, apparence/performance joueur, erreurs publiques, accessibilité et tables.

Il ne s’agit pas d’une validation par locuteur natif, d’une revue juridique, ni d’une preuve de rendu, d’accessibilité, de persistance ou de navigateur. Aucune source, catalogue, gate ou donnée n’a été modifié. Les noms, clubs, identifiants, résultats et marques sont exclus de la traduction factuelle.

## État par critère

| Critère | État | Constat statique |
|---|---|---|
| Naturel / fluide — échantillon des core/auth/market | PASS conditionnel | Les impératifs et le vouvoiement sont cohérents (`Choisissez`, `Connectez-vous`, `Votre`), les formulations d’authentification et les messages d’état sont compréhensibles. Les marques `TouchLine`, `ClubOwner`, `Market Transfer`, `Card Engine`, `TouchLine XI` et `TouchLine Verified` restent inchangées. |
| Naturel / fluide — rankings | BLOCKED | Une formulation mérite une révision humaine avant toute ouverture : `rankings-drafts.ts:108`, « L’espace compétitif du meilleur onze par poste, des entraîneurs en tête et de la ClubOwner Table. » Le groupe « des entraîneurs en tête » est moins naturel et la coordination est ambiguë. Proposition non appliquée : « L’espace compétitif du meilleur onze par poste, des entraîneurs les mieux classés et de la ClubOwner Table. » |
| Terminologie football | PASS conditionnel | `poste`, `effectif`, `classement`, `match`, `titularisations`, `entrées en jeu`, `matchs nuls`, `défaites` et `scores en direct` sont employés de façon cohérente dans les modules examinés. Les valeurs football/provenance inconnues restent des données et ne sont pas normalisées. |
| Cohérence produit / marques | PASS conditionnel | Les éléments protégés ci-dessus sont préservés ; `Market Transfer` est laissé en anglais. Une décision éditoriale future reste nécessaire pour savoir si « carte » est le terme produit définitif partout, mais ce n’est pas un défaut de données ni une autorisation de modifier le modèle commercial. |
| Placeholders et interpolation | PASS statique | Les placeholders à contrat, notamment `{incoming}`/`{outgoing}` dans `core-drafts.ts:78`, sont conservés byte-for-byte. Les fonctions de Market interpolent séparément noms et nombres ; aucun échappement ou changement de contrat détecté dans cette revue. |
| Pluriels et formats | PASS statique avec réserve | `market-drafts.ts:127-131` emploie `Intl.NumberFormat("fr-FR")` et `Intl.PluralRules("fr-FR")` pour les compteurs. Le choix CLDR de `one` pour zéro peut afficher « 0 joueur/carte/copie » ; c’est techniquement cohérent avec l’API, mais doit être confirmé par une revue éditoriale si le style produit exige le pluriel visuel après zéro. Aucun changement n’est proposé sans cette décision. |
| Ponctuation / typographie | PASS conditionnel | Les apostrophes typographiques et les espaces françaises avant `:`/`;` apparaissent dans les textes de table, performance et Market. L’environnement source ne prouve pas l’emploi d’espaces insécables au rendu : vérifier après intégration réelle, sans modifier les chaînes de manière mécanique. |
| Fallback anglais et gate | BLOCKED pour publication | `i18n.ts:24-25,963-968` déclare seulement `en-GB` et `pt-BR` complets puis normalise tout autre locale vers l’anglais. Les entrées fr-FR restent donc des drafts hors chemin public ; cette revue ne doit ni ouvrir le gate ni présenter une couverture en français comme livrée. |
| RTL / accessibilité / responsive / navigateur | BLOCKED hors preuve | Les chaînes françaises de `site-accessibility-i18n.ts`, `public-error-i18n.ts` et des aria labels semblent adaptées statiquement, mais aucune inspection clavier, lecteur d’écran, desktop/mobile, Safari, Chromium ou WebKit n’a été menée. |

## Points actionnables, sans modification

1. **P2 rédaction** — faire valider/corriger `rankings-drafts.ts:108` par une relecture française humaine avant un futur release gate. Le changement proposé concerne seulement la fluidité ; il ne doit pas modifier les sources, l’autorité du classement ni les marques.
2. **P2 convention de zéro** — demander une décision éditoriale explicite sur « 0 joueur/carte/copie » dans les compteurs Market. Si le pluriel visuel est souhaité, le correctif devra couvrir les clés fonctionnelles concernées et leurs tests, pas remplacer globalement `Intl.PluralRules`.
3. **P1 de release** — ne pas ouvrir `fr-FR` tant que la stratégie centrale de catalogue complet, l’intégration des consumers, la revue humaine, le rendu et les gates de persistance/notification ne sont pas prouvés séparément.

## Échantillons confirmés

- Auth : labels de formulaire, réinitialisation, consentement, confirmations et accès emploient un registre poli cohérent ; les placeholders e-mail et les noms restent intacts.
- Market : recherche, filtres, contrats, états indisponibles et aria labels sont explicites ; aucune règle de prix, de contrat, de portefeuille ou de paiement n’a été inférée par cette revue.
- Classements/tables : les avertissements sur provisoire, résultats vérifiés, positions retenues et intégrité restent prudents ; la terminologie ne transforme pas un score live en résultat final.
- Modules existants : `player-performance-i18n.ts:97-116`, `official-league-table-i18n.ts:9-37`, `public-error-i18n.ts:41-43` et `site-accessibility-i18n.ts:45-50` sont cohérents dans l’échantillon lu, sous les limites de rendu ci-dessus.

## Empreintes des sources lues

| Fichier | SHA-256 |
|---|---|
| `locale-catalogues/core-drafts.ts` | `c357d061740f3edf188f782481e1bc53b6b6155ec55122f5ba987b58c57fd6de` |
| `locale-catalogues/auth-drafts.ts` | `7ef072ad8ac5098284996caed077d166bead5a5700e45f1353ea7cbfd70d4392` |
| `locale-catalogues/market-drafts.ts` | `e58e35f4d7b863f110a10bac0dc92b99e28445c6c63f432e12cfdb8d1a345a8c` |
| `locale-catalogues/rankings-drafts.ts` | `b0bb37a786831bbb113ca2bdab9ff5b23bbf721c488c92c4c2ef0ce54e1f2d56` |
| `i18n.ts` | `83723b7dba1155ad83422dc2c90e9c290d159a0c3e4688e51522e51283416eb9` |
| modules de présentation fr-FR cités | hashes relevés pendant la lecture statique ; aucun n’a été modifié |

## Verdict

**PASS conditionnel de qualité statique pour la majorité de l’échantillon, avec un BLOCKED rédactionnel ciblé sur `tablesDescription` et un BLOCKED de release pour le gate, la revue humaine et le rendu.**

Tests, build, navigateur, base, scheduler, API et déploiement : non exécutés, par périmètre. Production non touchée.
