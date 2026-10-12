import type { TouchLineLocale } from "../touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../touchlineArena/catalogue-locale.ts";

/** Copy inventory for the standalone Fantasy builder. The six additional
 * languages are authored drafts: this catalogue does not enable them publicly.
 * Locale order is EN, PT, ES, IT, FR, AR, TR, DE. Arabic text may be RTL, but
 * the football pitch and card artwork must retain their own LTR orientation.
 */
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const satisfies readonly TouchLineLocale[];
type EightStrings = readonly [string, string, string, string, string, string, string, string];

const rows = {
  gameweek: ["Gameweek", "Rodada", "Jornada", "Giornata", "Journée", "الجولة", "Hafta", "Spieltag"],
  state: ["State", "Estado", "Estado", "Stato", "État", "الحالة", "Durum", "Status"],
  remaining: ["Remaining", "Restante", "Restante", "Residuo", "Restant", "المتبقي", "Kalan", "Verbleibend"],
  heroKicker: ["GAMEWEEK TEAM", "ESCALAÇÃO DA RODADA", "EQUIPO DE LA JORNADA", "SQUADRA DELLA GIORNATA", "ÉQUIPE DE LA JOURNÉE", "فريق الجولة", "HAFTANIN TAKIMI", "SPIELTAGS-TEAM"],
  heroTitle: ["Build Your TouchLine Team", "Monte seu time TouchLine", "Forma tu equipo TouchLine", "Crea la tua squadra TouchLine", "Composez votre équipe TouchLine", "شكّل فريقك في TouchLine", "TouchLine takımını kur", "Stelle dein TouchLine-Team zusammen"],
  heroIntro: ["Choose your coach first, then formation, and complete exactly 11 cards for the Gameweek.", "Escolha primeiro seu treinador, depois a formação e complete exatamente 11 cards para a rodada.", "Elige primero a tu entrenador, después la formación y completa exactamente 11 cartas para la jornada.", "Scegli prima l'allenatore, poi il modulo e completa esattamente 11 carte per la giornata.", "Choisissez d'abord votre entraîneur, puis la formation et complétez exactement 11 cartes pour la journée.", "اختر مدربك أولًا، ثم الخطة، وأكمل 11 بطاقة بالضبط لهذه الجولة.", "Önce teknik direktörünü, sonra dizilişi seç ve hafta için tam 11 kartı tamamla.", "Wähle zuerst deinen Trainer, dann die Formation und vervollständige genau 11 Karten für den Spieltag."],
  lineupStepsAria: ["Lineup steps", "Etapas da escalação", "Pasos de la alineación", "Fasi della formazione", "Étapes de la composition", "خطوات التشكيلة", "Kadro adımları", "Schritte zur Aufstellung"],
  mySquad: ["MY SQUAD", "MEU ELENCO", "MI PLANTILLA", "LA MIA ROSA", "MON EFFECTIF", "تشكيلتي", "KADROM", "MEIN KADER"],
  chooseFormation: ["Choose formation", "Escolha a formação", "Elige una formación", "Scegli il modulo", "Choisissez une formation", "اختر الخطة", "Dizilişi seç", "Formation wählen"],
  usedValue: ["Used value", "Valor usado", "Valor utilizado", "Valore utilizzato", "Valeur utilisée", "القيمة المستخدمة", "Kullanılan değer", "Genutzter Wert"],
  viewTacticalPitch: ["View tactical pitch", "Ver campo tático", "Ver campo táctico", "Mostra il campo tattico", "Voir le terrain tactique", "عرض الملعب التكتيكي", "Taktik sahayı göster", "Taktikfeld anzeigen"],
  viewSquad: ["View squad", "Ver elenco", "Ver plantilla", "Mostra la rosa", "Voir l'effectif", "عرض التشكيلة", "Kadroyu göster", "Kader anzeigen"],
  tacticalPitchAria: ["Gameweek tactical pitch", "Campo tático da equipe da rodada", "Campo táctico del equipo de la jornada", "Campo tattico della squadra della giornata", "Terrain tactique de l'équipe de la journée", "الملعب التكتيكي لفريق الجولة", "Haftanın takımının taktik sahası", "Taktikfeld des Spieltags-Teams"],
  replace: ["Replace", "Trocar", "Sustituir", "Sostituisci", "Remplacer", "استبدال", "Değiştir", "Ersetzen"],
  selectPlayerFor: ["Select player for", "Selecionar jogador para", "Seleccionar jugador para", "Seleziona un giocatore per", "Sélectionner un joueur pour", "اختر لاعبًا للمركز", "Şu pozisyon için oyuncu seç:", "Spieler auswählen für"],
  remove: ["Remove", "Remover", "Eliminar", "Rimuovi", "Retirer", "إزالة", "Kaldır", "Entfernen"],
  notSelected: ["Not selected", "Fora da súmula", "Fuera de la convocatoria", "Non convocato", "Non retenu", "خارج قائمة المباراة", "Maç kadrosunda değil", "Nicht im Spieltagskader"],
  squadByPositionAria: ["Squad by position", "Elenco por posição", "Plantilla por posición", "Rosa per ruolo", "Effectif par poste", "التشكيلة حسب المركز", "Pozisyona göre kadro", "Kader nach Position"],
  openSlot: ["Open slot", "Vaga aberta", "Puesto libre", "Posto libero", "Poste libre", "مركز شاغر", "Boş pozisyon", "Freier Platz"],
  coachPending: ["Coach pending", "Treinador pendente", "Entrenador pendiente", "Allenatore da scegliere", "Entraîneur à choisir", "المدرب لم يُحدَّد بعد", "Teknik direktör bekleniyor", "Trainer noch offen"],
  noPerClubLimit: ["No per-club player limit", "Escolha livre de jogadores por clube", "Sin límite de jugadores por club", "Nessun limite di giocatori per club", "Aucune limite de joueurs par club", "لا حد لعدد اللاعبين من كل نادٍ", "Kulüp başına oyuncu sınırı yok", "Kein Spielerlimit pro Verein"],
  validXI: ["Valid XI", "XI válido", "XI válido", "XI valido", "Onze valide", "تشكيلة صالحة من 11 لاعبًا", "Geçerli ilk 11", "Gültige Startelf"],
  selectionPanelAria: ["TouchLine selection panel", "Painel de escolha TouchLine", "Panel de selección de TouchLine", "Pannello di selezione TouchLine", "Panneau de sélection TouchLine", "لوحة اختيار TouchLine", "TouchLine seçim paneli", "TouchLine-Auswahlbereich"],
  selectedCoach: ["Selected coach", "Treinador escolhido", "Entrenador elegido", "Allenatore scelto", "Entraîneur choisi", "المدرب المختار", "Seçilen teknik direktör", "Gewählter Trainer"],
  selectedCoachKicker: ["SELECTED COACH", "TREINADOR ESCOLHIDO", "ENTRENADOR ELEGIDO", "ALLENATORE SCELTO", "ENTRAÎNEUR CHOISI", "المدرب المختار", "SEÇİLEN TEKNİK DİREKTÖR", "GEWÄHLTER TRAINER"],
  rank: ["RANK", "POSIÇÃO", "PUESTO", "POSIZIONE", "RANG", "الترتيب", "SIRA", "RANG"],
  home: ["HOME", "CASA", "LOCAL", "CASA", "DOMICILE", "على الأرض", "İÇ SAHA", "HEIM"],
  away: ["AWAY", "FORA", "VISITANTE", "TRASFERTA", "EXTÉRIEUR", "خارج الأرض", "DEPLASMAN", "AUSWÄRTS"],
  change: ["Change", "Trocar", "Cambiar", "Cambia", "Changer", "تغيير", "Değiştir", "Ändern"],
  step1: ["STEP 1", "ETAPA 1", "PASO 1", "FASE 1", "ÉTAPE 1", "الخطوة ١", "ADIM 1", "SCHRITT 1"],
  technicalArea: ["TECHNICAL AREA", "ÁREA TÉCNICA", "ÁREA TÉCNICA", "AREA TECNICA", "ZONE TECHNIQUE", "المنطقة الفنية", "TEKNİK ALAN", "TECHNISCHE ZONE"],
  chooseCoach: ["Choose your coach", "Escolha seu treinador", "Elige a tu entrenador", "Scegli il tuo allenatore", "Choisissez votre entraîneur", "اختر مدربك", "Teknik direktörünü seç", "Wähle deinen Trainer"],
  coachInstruction: ["Select a club to preview its coach; hire only when you decide.", "Clique num clube para ver o treinador; contrate somente quando decidir.", "Selecciona un club para ver a su entrenador; contrátalo solo cuando lo decidas.", "Seleziona un club per vedere l'allenatore; ingaggialo solo quando hai deciso.", "Sélectionnez un club pour voir son entraîneur ; engagez-le seulement quand vous avez décidé.", "اختر ناديًا لمعاينة مدربه؛ تعاقد معه فقط عندما تحسم قرارك.", "Teknik direktörünü görmek için bir kulüp seç; kararını verdiğinde anlaşma yap.", "Wähle einen Verein, um seinen Trainer anzusehen; verpflichte ihn erst nach deiner Entscheidung."],
  scrollCoachListAria: ["Scrollable coach list", "Lista rolável de treinadores", "Lista desplazable de entrenadores", "Elenco scorrevole degli allenatori", "Liste déroulante des entraîneurs", "قائمة مدربين قابلة للتمرير", "Kaydırılabilir teknik direktör listesi", "Scrollbare Trainerliste"],
  verifiedMark: ["TOUCHLINE VERIFIED", "TOUCHLINE VERIFIED", "TOUCHLINE VERIFIED", "TOUCHLINE VERIFIED", "TOUCHLINE VERIFIED", "TOUCHLINE VERIFIED", "TOUCHLINE VERIFIED", "TOUCHLINE VERIFIED"],
  coachHiredNext: ["Coach hired. Choose the formation next.", "Treinador contratado. Escolha agora a formação.", "Entrenador contratado. Elige ahora la formación.", "Allenatore ingaggiato. Ora scegli il modulo.", "Entraîneur engagé. Choisissez maintenant la formation.", "تم التعاقد مع المدرب. اختر الخطة الآن.", "Teknik direktör anlaştı. Şimdi dizilişi seç.", "Trainer verpflichtet. Wähle jetzt die Formation."],
  hireCoach: ["Hire coach", "Contratar treinador", "Contratar entrenador", "Ingaggia allenatore", "Engager l'entraîneur", "التعاقد مع المدرب", "Teknik direktörü getir", "Trainer verpflichten"],
  noCanonicalCoach: ["No canonical coach is available for this club.", "Nenhum treinador canônico disponível para este clube.", "No hay ningún entrenador canónico disponible para este club.", "Nessun allenatore canonico è disponibile per questo club.", "Aucun entraîneur canonique n'est disponible pour ce club.", "لا يوجد مدرب معتمد متاح لهذا النادي.", "Bu kulüp için kanonik teknik direktör bulunmuyor.", "Für diesen Verein ist kein kanonischer Trainer verfügbar."],
  step2: ["STEP 2", "ETAPA 2", "PASO 2", "FASE 2", "ÉTAPE 2", "الخطوة ٢", "ADIM 2", "SCHRITT 2"],
  formationInstruction: ["Every option comes from the calibrated canonical registry.", "Todas as opções vêm do registro canônico calibrado.", "Todas las opciones proceden del registro canónico calibrado.", "Ogni opzione proviene dal registro canonico calibrato.", "Toutes les options proviennent du registre canonique calibré.", "جميع الخيارات تأتي من سجل الخطط المعتمد والمضبوط.", "Tüm seçenekler kalibre edilmiş kanonik kayıttan gelir.", "Alle Optionen stammen aus dem kalibrierten kanonischen Register."],
  slots: ["slots", "vagas", "puestos", "posti", "postes", "مراكز", "pozisyon", "Plätze"],
  step3: ["STEP 3", "ETAPA 3", "PASO 3", "FASE 3", "ÉTAPE 3", "الخطوة ٣", "ADIM 3", "SCHRITT 3"],
  fillSlot: ["Fill the slot", "Preencha a vaga", "Completa el puesto", "Completa il posto", "Complétez le poste", "املأ المركز", "Pozisyonu doldur", "Platz besetzen"],
  selectPitchSlot: ["Select a slot on the pitch.", "Selecione uma vaga no campo.", "Selecciona un puesto en el campo.", "Seleziona un posto in campo.", "Sélectionnez un poste sur le terrain.", "اختر مركزًا على الملعب.", "Sahada bir pozisyon seç.", "Wähle einen Platz auf dem Feld."],
  searchPlayer: ["Search player", "Pesquisar jogador", "Buscar jugador", "Cerca giocatore", "Rechercher un joueur", "ابحث عن لاعب", "Oyuncu ara", "Spieler suchen"],
  scrollPlayerListAria: ["Scrollable player list", "Lista rolável de atletas", "Lista desplazable de jugadores", "Elenco scorrevole dei giocatori", "Liste déroulante des joueurs", "قائمة لاعبين قابلة للتمرير", "Kaydırılabilir oyuncu listesi", "Scrollbare Spielerliste"],
  chooseForSlot: ["Choose for this slot", "Escolher para esta vaga", "Elegir para este puesto", "Scegli per questo posto", "Choisir pour ce poste", "اختر لهذا المركز", "Bu pozisyon için seç", "Für diesen Platz wählen"],
  noPlayersForPosition: ["No player for this position is available at this club.", "Nenhum jogador desta posição está disponível neste clube.", "No hay jugadores disponibles para esta posición en este club.", "Nessun giocatore per questo ruolo è disponibile in questo club.", "Aucun joueur n'est disponible à ce poste dans ce club.", "لا يوجد لاعب متاح لهذا المركز في هذا النادي.", "Bu kulüpte bu pozisyon için uygun oyuncu yok.", "Für diese Position ist in diesem Verein kein Spieler verfügbar."],
  step4: ["STEP 4", "ETAPA 4", "PASO 4", "FASE 4", "ÉTAPE 4", "الخطوة ٤", "ADIM 4", "SCHRITT 4"],
  reviewTeam: ["Review your team", "Revise sua equipe", "Revisa tu equipo", "Controlla la tua squadra", "Vérifiez votre équipe", "راجع فريقك", "Takımını gözden geçir", "Prüfe dein Team"],
  changeCoach: ["Change coach", "Trocar treinador", "Cambiar entrenador", "Cambia allenatore", "Changer d'entraîneur", "تغيير المدرب", "Teknik direktörü değiştir", "Trainer wechseln"],
  editPlayers: ["Edit players", "Editar jogadores", "Editar jugadores", "Modifica giocatori", "Modifier les joueurs", "تعديل اللاعبين", "Oyuncuları düzenle", "Spieler bearbeiten"],
  readyConfirm: ["Ready to confirm", "Pronto para confirmar", "Listo para confirmar", "Pronto per la conferma", "Prêt à confirmer", "جاهز للتأكيد", "Onaylamaya hazır", "Bereit zur Bestätigung"],
  step5: ["STEP 5", "ETAPA 5", "PASO 5", "FASE 5", "ÉTAPE 5", "الخطوة ٥", "ADIM 5", "SCHRITT 5"],
lockedSnapshot: ["LOCKED SNAPSHOT", "ESCALAÇÃO BLOQUEADA", "INSTANTÁNEA BLOQUEADA", "ISTANTANEA BLOCCATA", "INSTANTANÉ VERROUILLÉ", "لقطة مقفلة", "KİLİTLİ ANLIK GÖRÜNTÜ", "GESPERRTER STAND"],
  confirmedTeam: ["Confirmed team", "Equipe confirmada", "Equipo confirmado", "Squadra confermata", "Équipe confirmée", "فريق مؤكد", "Onaylanan takım", "Bestätigtes Team"],
  lockedTeam: ["Gameweek team locked", "Equipe da rodada bloqueada", "Equipo de la jornada bloqueado", "Squadra della giornata bloccata", "Équipe de la journée verrouillée", "فريق الجولة مقفل", "Haftanın takımı kilitlendi", "Spieltags-Team gesperrt"],
  marketReady: ["The same canonical identity, coach, formation and 11 players is ready in Market.", "A mesma identidade canônica, treinador, formação e 11 jogadores está pronta no Mercado.", "La misma identidad canónica, entrenador, formación y 11 jugadores ya están disponibles en el Mercado.", "La stessa identità canonica, l'allenatore, il modulo e gli 11 giocatori sono pronti nel Mercato.", "La même identité canonique, l'entraîneur, la formation et les 11 joueurs sont prêts dans le Marché.", "الهوية المعتمدة نفسها والمدرب والخطة واللاعبون الأحد عشر جاهزون في السوق.", "Aynı kanonik kimlik, teknik direktör, diziliş ve 11 oyuncu Pazar'da hazır.", "Dieselbe kanonische Identität, Trainer, Formation und 11 Spieler sind im Markt bereit."],
  confirmToSync: ["Confirm the XI to enable sync.", "Confirme o XI para liberar a sincronização.", "Confirma el XI para activar la sincronización.", "Conferma l'XI per attivare la sincronizzazione.", "Confirmez le onze pour activer la synchronisation.", "أكد التشكيلة لتمكين المزامنة.", "Senkronizasyonu etkinleştirmek için ilk 11'i onayla.", "Bestätige die Startelf, um die Synchronisierung zu aktivieren."],
  openMarket: ["Open Market", "Abrir Mercado", "Abrir Mercado", "Apri Mercato", "Ouvrir le Marché", "افتح السوق", "Pazarı aç", "Markt öffnen"],
  canonicalDeadline: ["Canonical deadline", "Prazo canônico", "Plazo canónico", "Scadenza canonica", "Échéance canonique", "الموعد النهائي المعتمد", "Kanonik son tarih", "Kanonische Frist"],
  deadlineRule: ["Closes at the first kickoff; reopens after the last confirmed final whistle.", "Fecha no início da primeira partida; reabre após o apito final confirmado da última.", "Cierra con el primer saque inicial y reabre tras el último pitido final confirmado.", "Chiude al primo calcio d'inizio e riapre dopo l'ultimo fischio finale confermato.", "Ferme au premier coup d'envoi et rouvre après le dernier coup de sifflet final confirmé.", "يغلق مع انطلاق أول مباراة ويُفتح مجددًا بعد تأكيد نهاية آخر مباراة.", "İlk maçın başlama vuruşunda kapanır; son maçın bitişi doğrulandıktan sonra yeniden açılır.", "Schließt beim ersten Anstoß und öffnet nach dem letzten bestätigten Schlusspfiff wieder."],
  unsavedChanges: ["Unsaved changes", "Alterações não salvas", "Cambios sin guardar", "Modifiche non salvate", "Modifications non enregistrées", "تغييرات غير محفوظة", "Kaydedilmemiş değişiklikler", "Ungespeicherte Änderungen"],
  teamSaved: ["Team saved in TouchLine", "Equipe gravada no TouchLine", "Equipo guardado en TouchLine", "Squadra salvata in TouchLine", "Équipe enregistrée dans TouchLine", "تم حفظ الفريق في TouchLine", "Takım TouchLine'a kaydedildi", "Team in TouchLine gespeichert"],
  notSaved: ["Not saved yet", "Ainda não salvo", "Aún no guardado", "Non ancora salvato", "Pas encore enregistré", "لم يُحفظ بعد", "Henüz kaydedilmedi", "Noch nicht gespeichert"],
  saveDraft: ["Save draft", "Salvar rascunho", "Guardar borrador", "Salva bozza", "Enregistrer le brouillon", "احفظ المسودة", "Taslağı kaydet", "Entwurf speichern"],
  confirmXI: ["Confirm XI", "Confirmar XI", "Confirmar XI", "Conferma XI", "Confirmer le onze", "تأكيد التشكيلة", "İlk 11'i onayla", "Startelf bestätigen"],
  lineupUpdate: ["Official lineup update", "Atualização da escalação oficial", "Actualización de la alineación oficial", "Aggiornamento della formazione ufficiale", "Mise à jour de la composition officielle", "تحديث التشكيلة الرسمية", "Resmî kadro güncellemesi", "Aktualisierung der offiziellen Aufstellung"],
  absentPlayers: ["{count} selected player(s) are absent from starters and bench. {action}", "{count} jogador(es) selecionado(s) não aparece(m) entre titulares ou banco. {action}", "{count} jugador(es) seleccionados no figuran entre titulares ni suplentes. {action}", "{count} giocatori selezionati non sono tra titolari e riserve. {action}", "{count} joueurs sélectionnés ne figurent ni parmi les titulaires ni sur le banc. {action}", "عدد اللاعبين المختارين غير الموجودين ضمن الأساسيين أو البدلاء: {count}. {action}", "Seçilen {count} oyuncu ilk 11'de veya yedeklerde yok. {action}", "{count} ausgewählte Spieler stehen weder in der Startelf noch auf der Bank. {action}"],
  canStillEdit: ["You can still edit before the deadline.", "Você ainda pode editar antes do prazo.", "Todavía puedes editar antes del plazo.", "Puoi ancora modificare prima della scadenza.", "Vous pouvez encore modifier avant l'échéance.", "لا يزال بإمكانك التعديل قبل الموعد النهائي.", "Son tarihten önce hâlâ düzenleyebilirsin.", "Du kannst vor Ablauf der Frist noch Änderungen vornehmen."],
  immutableAfterDeadline: ["The deadline passed; the team remains immutable.", "O prazo encerrou; a equipe permanece imutável.", "El plazo terminó; el equipo ya no se puede modificar.", "La scadenza è passata; la squadra non può più essere modificata.", "L'échéance est passée ; l'équipe ne peut plus être modifiée.", "انتهى الموعد النهائي؛ تبقى التشكيلة غير قابلة للتعديل.", "Son tarih geçti; takım artık değiştirilemez.", "Die Frist ist abgelaufen; das Team bleibt unveränderbar."],
  gameweekRanking: ["Gameweek ranking", "Ranking da rodada", "Clasificación de la jornada", "Classifica della giornata", "Classement de la journée", "ترتيب الجولة", "Hafta sıralaması", "Spieltags-Rangliste"],
  rankingAfterLock: ["Published after locked teams exist.", "Será publicado após existirem equipes bloqueadas.", "Se publicará cuando haya equipos bloqueados.", "Sarà pubblicata quando ci saranno squadre bloccate.", "Publié une fois que des équipes sont verrouillées.", "يُنشر بعد وجود فرق مقفلة.", "Kilitlenmiş takımlar oluştuğunda yayımlanır.", "Wird veröffentlicht, sobald gesperrte Teams vorhanden sind."],
  seasonRanking: ["Season ranking", "Ranking da temporada", "Clasificación de la temporada", "Classifica stagionale", "Classement de la saison", "ترتيب الموسم", "Sezon sıralaması", "Saison-Rangliste"],
  noFinalResults: ["No final results yet.", "Ainda não há resultados finais.", "Aún no hay resultados finales.", "Non ci sono ancora risultati finali.", "Aucun résultat définitif pour le moment.", "لا توجد نتائج نهائية بعد.", "Henüz kesinleşmiş sonuç yok.", "Noch keine endgültigen Ergebnisse."],
  rulesKicker: ["TOUCHLINE GAMEWEEK RULES", "REGRAS DA RODADA TOUCHLINE", "REGLAS DE LA JORNADA TOUCHLINE", "REGOLE DELLA GIORNATA TOUCHLINE", "RÈGLES DE LA JOURNÉE TOUCHLINE", "قواعد جولة TOUCHLINE", "TOUCHLINE HAFTA KURALLARI", "TOUCHLINE-SPIELTAGSREGELN"],
  rulesTitle: ["11 cards. One Starting XI.", "11 cards. Um XI titular.", "11 cartas. Un once titular.", "11 carte. Un undici titolare.", "11 cartes. Un onze de départ.", "11 بطاقة. تشكيلة أساسية واحدة.", "11 kart. Tek bir ilk 11.", "11 Karten. Eine Startelf."],
  rulesIntro: ["Official TouchLine Rating is the Gameweek source; a missing Rating is never invented.", "Rating oficial TouchLine é a fonte da rodada; Rating ausente nunca é inventado.", "La valoración oficial de TouchLine es la fuente de la jornada; nunca se inventa una valoración ausente.", "Il rating ufficiale TouchLine è la fonte della giornata; un rating mancante non viene mai inventato.", "La note officielle TouchLine est la source de la journée ; aucune note manquante n'est inventée.", "تقييم TouchLine الرسمي هو مصدر الجولة؛ ولا يُختلق تقييم مفقود.", "Resmî TouchLine puanı haftanın kaynağıdır; eksik puan asla uydurulmaz.", "Die offizielle TouchLine-Bewertung ist die Quelle des Spieltags; eine fehlende Bewertung wird nie erfunden."],
} as const satisfies Record<string, EightStrings>;

export type TouchlineFantasyStandaloneBuilderCopy = Readonly<{ [Key in keyof typeof rows]: string }>;
export const TOUCHLINE_FANTASY_STANDALONE_BUILDER_DRAFT_LOCALES = locales.slice(2) as readonly TouchLineLocale[];
export const TOUCHLINE_FANTASY_STANDALONE_BUILDER_DRAFT_STATUS = "draft" as const;

export const TOUCHLINE_FANTASY_STANDALONE_BUILDER_CATALOGUES = Object.fromEntries(locales.map((locale, index) => [
  locale,
  Object.fromEntries(Object.entries(rows).map(([key, translations]) => [key, translations[index]])),
])) as Record<TouchLineLocale, TouchlineFantasyStandaloneBuilderCopy>;

export function getTouchlineFantasyStandaloneBuilderCopy(locale?: string | null, draftLocalesEnabled = false): TouchlineFantasyStandaloneBuilderCopy {
  return TOUCHLINE_FANTASY_STANDALONE_BUILDER_CATALOGUES[resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled)];
}

export function formatTouchlineFantasyStandaloneAlert(copy: TouchlineFantasyStandaloneBuilderCopy, count: number, editable: boolean): string {
  return copy.absentPlayers.replace("{count}", String(count)).replace("{action}", editable ? copy.canStillEdit : copy.immutableAfterDeadline);
}
