import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as icons from "lucide-react";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as match from "../lib/touchlineArena/match-centre.ts";
import * as clubs from "../lib/touchlineArena/demo-data.ts";
import * as coaches from "../lib/touchlineArena/live-coaches.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as matchEvents from "../lib/touchlineArena/match-event-i18n.ts";
import * as positions from "../lib/touchlineArena/position-labels.ts";

const load = () => import("../lib/touchlineArena/match-centre-i18n.ts");
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const eventOracles = {
  "en-GB": ["Event", "Related player"], "pt-BR": ["Evento", "Jogador relacionado"],
  "es-ES": ["Evento", "Jugador relacionado"], "it-IT": ["Evento", "Giocatore coinvolto"],
  "fr-FR": ["Événement", "Joueur associé"], "ar-SA": ["حدث", "لاعب مرتبط بالحدث"],
  "tr-TR": ["Olay", "İlgili oyuncu"], "de-DE": ["Ereignis", "Beteiligter Spieler"],
} as const;
const baseline = {
  "pt-BR": {
    title: "Central da partida", live: "AO VIVO", today: "HOJE", upcoming: "PRÓXIMOS", finished: "ARQUIVO", currentFixtures: "Confrontos desta semana", recentResults: "Últimos resultados", matchweek: "Rodada", roundPending: "Rodada aguardando confirmação TouchLine", competition: "TouchLine England", league: "Liga TouchLine England", england: "Inglaterra", select: "Confrontos", alertsSoon: "Alertas de partida em breve", selectedFixture: "Partida selecionada", noFixtures: "Agenda em atualização", noFixturesCopy: "A programação oficial será exibida assim que a competição publicar fixtures canônicos.", venue: "Estádio", venuePending: "Aguardando confirmação TouchLine do estádio", capacity: "Capacidade", homeOf: "Casa do", photo: "Foto", countdown: "Início em", detail: "Dados da partida", dataPending: "Eventos, escalações e estatísticas aparecem assim que forem verificados pela TouchLine.", recent: "Linha do tempo oficial", form: "Escalações verificadas", players: "Ratings da partida", archive: "Arquivo TouchLine", provider: "TouchLine Verified", timezone: "Horário local", versus: "VS", completed: "ENCERRADO", liveNow: "AO VIVO", next: "PRÓXIMO", official: "TouchLine Data", watch: "Acompanhar partida", liveDataUpdating: "Dados ao vivo em atualização", liveDataUpdatingCopy: "Exibindo o último snapshot verificado; o placar pode estar atrasado.", partialScheduleCopy: "A programação persistida está disponível, mas placares ao vivo aguardam um snapshot verificado.", lastVerified: "ÚLTIMO VERIFICADO", lastVerifiedAt: "Última verificação", events: "eventos oficiais", scoring: "ratings oficiais", lineupAvailable: "Escalação disponível", viewLineup: "VER ESCALAÇÃO", lineupPending: "Escalação oficial ainda não disponível", lineupPendingCopy: "A escalação será exibida aqui quando estiver disponível e verificada.", starters: "Titulares", bench: "Reservas", minutes: "MIN", rating: "NOTA", noScoring: "Sem rating oficial", assist: "Assistência", substitutedFor: "entrou por", dataUnavailable: "—", highlights: "Destaques da partida", bestCoach: "Treinador vencedor", bestCards: "Melhores cards da partida", winnerVerified: "Vitória confirmada", calculating: "Em apuração", ratingVerified: "Rating verificado",
  },
  "en-GB": {
    title: "Match Centre", live: "LIVE NOW", today: "TODAY", upcoming: "UPCOMING", finished: "ARCHIVE", currentFixtures: "This week's fixtures", recentResults: "Latest results", matchweek: "Matchweek", roundPending: "Matchweek awaiting TouchLine confirmation", competition: "TouchLine England", league: "TouchLine England League", england: "England", select: "Fixtures", alertsSoon: "Match alerts coming soon", selectedFixture: "Selected fixture", noFixtures: "Schedule updating", noFixturesCopy: "Official fixtures will appear as soon as the competition publishes the canonical schedule.", venue: "Stadium", venuePending: "Awaiting TouchLine venue verification", capacity: "Capacity", homeOf: "Home of", photo: "Photo", countdown: "Kick-off in", detail: "Match data", dataPending: "Events, line-ups and statistics appear as soon as TouchLine verifies them.", recent: "Official timeline", form: "Verified line-ups", players: "Match ratings", archive: "TouchLine archive", provider: "TouchLine Verified", timezone: "Local time", versus: "VS", completed: "FULL TIME", liveNow: "LIVE", next: "NEXT", official: "TouchLine Data", watch: "Open match", liveDataUpdating: "Live data updating", liveDataUpdatingCopy: "Showing the last verified snapshot; the score may be delayed.", partialScheduleCopy: "The persisted schedule is available, but live scores are awaiting a verified snapshot.", lastVerified: "LAST VERIFIED", lastVerifiedAt: "Last verification", events: "official events", scoring: "official ratings", lineupAvailable: "Line-up available", viewLineup: "VIEW LINE-UP", lineupPending: "Official line-up is not available yet", lineupPendingCopy: "The line-up will appear here when it is available and verified.", starters: "Starters", bench: "Bench", minutes: "MIN", rating: "RATING", noScoring: "No official rating", assist: "Assist", substitutedFor: "for", dataUnavailable: "—", highlights: "Match Highlights", bestCoach: "Winning Coach", bestCards: "Top Match Cards", winnerVerified: "Verified win", calculating: "Calculating", ratingVerified: "Verified rating",
  },
} as const;
const draftStringOracles = {
  "es-ES": {"title":"Centro del partido","metadataTitle":"En directo | TouchLine England","metadataDescription":"Partidos, eventos y estadísticas en directo de TouchLine England.","live":"EN DIRECTO","today":"HOY","upcoming":"PRÓXIMOS","finished":"ARCHIVO","currentFixtures":"Partidos de esta semana","recentResults":"Últimos resultados","matchweek":"Jornada","roundPending":"Jornada pendiente de confirmación de TouchLine","competition":"TouchLine England","league":"Liga TouchLine England","england":"Inglaterra","select":"Partidos","alertsSoon":"Alertas de partido próximamente","selectedFixture":"Partido seleccionado","noFixtures":"Calendario en actualización","noFixturesCopy":"Los partidos oficiales aparecerán cuando la competición publique el calendario canónico.","venue":"Estadio","venuePending":"Pendiente de verificación del estadio por TouchLine","capacity":"Capacidad","homeOf":"Estadio de","photo":"Foto","countdown":"Comienza en","detail":"Datos del partido","dataPending":"Los eventos, las alineaciones y las estadísticas aparecerán cuando TouchLine los verifique.","recent":"Cronología oficial","form":"Alineaciones verificadas","players":"Valoraciones del partido","archive":"Archivo TouchLine","provider":"TouchLine Verified","timezone":"Hora local","versus":"VS","completed":"FINALIZADO","liveNow":"EN DIRECTO","next":"PRÓXIMO","official":"TouchLine Data","watch":"Abrir partido","liveDataUpdating":"Datos en directo en actualización","liveDataUpdatingCopy":"Se muestra la última instantánea verificada; el marcador puede estar desactualizado.","partialScheduleCopy":"El calendario guardado está disponible, pero los marcadores en directo esperan una instantánea verificada.","lastVerified":"ÚLTIMO VERIFICADO","lastVerifiedAt":"Última verificación","events":"eventos oficiales","scoring":"valoraciones oficiales","lineupAvailable":"Alineación disponible","viewLineup":"VER ALINEACIÓN","lineupPending":"La alineación oficial aún no está disponible","lineupPendingCopy":"La alineación aparecerá aquí cuando esté disponible y verificada.","starters":"Titulares","bench":"Suplentes","minutes":"MIN","rating":"VALORACIÓN","noScoring":"Sin valoración oficial","assist":"Asistencia","substitutedFor":"por","dataUnavailable":"—","highlights":"Destacados del partido","bestCoach":"Entrenador ganador","bestCards":"Mejores tarjetas del partido","winnerVerified":"Victoria verificada","calculating":"En evaluación","ratingVerified":"Valoración verificada","season":"Temporada","homeFallback":"Local","awayFallback":"Visitante","eventFallback":"Evento","dayUnit":"d","hourUnit":"h","minuteUnit":"m"},
  "it-IT": {"title":"Centro partita","metadataTitle":"In diretta | TouchLine England","metadataDescription":"Partite, eventi e statistiche in diretta di TouchLine England.","live":"IN DIRETTA","today":"OGGI","upcoming":"PROSSIME","finished":"ARCHIVIO","currentFixtures":"Partite di questa settimana","recentResults":"Ultimi risultati","matchweek":"Giornata","roundPending":"Giornata in attesa di conferma TouchLine","competition":"TouchLine England","league":"Campionato TouchLine England","england":"Inghilterra","select":"Partite","alertsSoon":"Avvisi partita prossimamente","selectedFixture":"Partita selezionata","noFixtures":"Calendario in aggiornamento","noFixturesCopy":"Le partite ufficiali appariranno quando la competizione pubblicherà il calendario canonico.","venue":"Stadio","venuePending":"In attesa della verifica dello stadio da parte di TouchLine","capacity":"Capienza","homeOf":"Casa del","photo":"Foto","countdown":"Calcio d’inizio tra","detail":"Dati della partita","dataPending":"Eventi, formazioni e statistiche appariranno quando TouchLine li avrà verificati.","recent":"Cronologia ufficiale","form":"Formazioni verificate","players":"Voti della partita","archive":"Archivio TouchLine","provider":"TouchLine Verified","timezone":"Ora locale","versus":"VS","completed":"TERMINATA","liveNow":"IN DIRETTA","next":"PROSSIMA","official":"TouchLine Data","watch":"Apri partita","liveDataUpdating":"Dati in diretta in aggiornamento","liveDataUpdatingCopy":"È mostrata l’ultima istantanea verificata; il punteggio potrebbe essere in ritardo.","partialScheduleCopy":"Il calendario salvato è disponibile, ma i punteggi in diretta attendono un’istantanea verificata.","lastVerified":"ULTIMO VERIFICATO","lastVerifiedAt":"Ultima verifica","events":"eventi ufficiali","scoring":"voti ufficiali","lineupAvailable":"Formazione disponibile","viewLineup":"VEDI FORMAZIONE","lineupPending":"La formazione ufficiale non è ancora disponibile","lineupPendingCopy":"La formazione apparirà qui quando sarà disponibile e verificata.","starters":"Titolari","bench":"Riserve","minutes":"MIN","rating":"VOTO","noScoring":"Nessun voto ufficiale","assist":"Assist","substitutedFor":"al posto di","dataUnavailable":"—","highlights":"Protagonisti della partita","bestCoach":"Allenatore vincente","bestCards":"Migliori carte della partita","winnerVerified":"Vittoria verificata","calculating":"In valutazione","ratingVerified":"Voto verificato","season":"Stagione","homeFallback":"Casa","awayFallback":"Trasferta","eventFallback":"Evento","dayUnit":"g","hourUnit":"h","minuteUnit":"m"},
  "fr-FR": {"title":"Centre du match","metadataTitle":"En direct | TouchLine England","metadataDescription":"Matchs, événements et statistiques en direct de TouchLine England.","live":"EN DIRECT","today":"AUJOURD’HUI","upcoming":"À VENIR","finished":"ARCHIVES","currentFixtures":"Matchs de cette semaine","recentResults":"Derniers résultats","matchweek":"Journée","roundPending":"Journée en attente de confirmation TouchLine","competition":"TouchLine England","league":"Ligue TouchLine England","england":"Angleterre","select":"Matchs","alertsSoon":"Alertes de match prochainement","selectedFixture":"Match sélectionné","noFixtures":"Calendrier en cours de mise à jour","noFixturesCopy":"Les matchs officiels apparaîtront dès que la compétition publiera le calendrier canonique.","venue":"Stade","venuePending":"En attente de vérification du stade par TouchLine","capacity":"Capacité","homeOf":"Stade de","photo":"Photo","countdown":"Coup d’envoi dans","detail":"Données du match","dataPending":"Les événements, compositions et statistiques apparaîtront après vérification par TouchLine.","recent":"Chronologie officielle","form":"Compositions vérifiées","players":"Notes du match","archive":"Archives TouchLine","provider":"TouchLine Verified","timezone":"Heure locale","versus":"VS","completed":"TERMINÉ","liveNow":"EN DIRECT","next":"PROCHAIN","official":"TouchLine Data","watch":"Ouvrir le match","liveDataUpdating":"Données en direct en cours de mise à jour","liveDataUpdatingCopy":"Dernier instantané vérifié affiché ; le score peut être en retard.","partialScheduleCopy":"Le calendrier enregistré est disponible, mais les scores en direct attendent un instantané vérifié.","lastVerified":"DERNIER VÉRIFIÉ","lastVerifiedAt":"Dernière vérification","events":"événements officiels","scoring":"notes officielles","lineupAvailable":"Composition disponible","viewLineup":"VOIR LA COMPOSITION","lineupPending":"La composition officielle n’est pas encore disponible","lineupPendingCopy":"La composition apparaîtra ici lorsqu’elle sera disponible et vérifiée.","starters":"Titulaires","bench":"Remplaçants","minutes":"MIN","rating":"NOTE","noScoring":"Aucune note officielle","assist":"Passe décisive","substitutedFor":"à la place de","dataUnavailable":"—","highlights":"Joueurs et entraîneur à l’honneur","bestCoach":"Entraîneur vainqueur","bestCards":"Meilleures cartes du match","winnerVerified":"Victoire vérifiée","calculating":"En cours d’évaluation","ratingVerified":"Note vérifiée","season":"Saison","homeFallback":"Domicile","awayFallback":"Extérieur","eventFallback":"Événement","dayUnit":"j","hourUnit":"h","minuteUnit":"m"},
  "ar-SA": {"title":"مركز المباراة","metadataTitle":"مباشر | TouchLine England","metadataDescription":"مباريات وأحداث وإحصاءات مباشرة من TouchLine England.","live":"مباشر الآن","today":"اليوم","upcoming":"القادمة","finished":"الأرشيف","currentFixtures":"مباريات هذا الأسبوع","recentResults":"أحدث النتائج","matchweek":"الجولة","roundPending":"الجولة بانتظار تأكيد TouchLine","competition":"TouchLine England","league":"دوري TouchLine England","england":"إنجلترا","select":"المباريات","alertsSoon":"تنبيهات المباريات قريبًا","selectedFixture":"المباراة المحددة","noFixtures":"جارٍ تحديث الجدول","noFixturesCopy":"ستظهر المباريات الرسمية عندما تنشر المسابقة جدولها المعتمد.","venue":"الملعب","venuePending":"بانتظار تحقق TouchLine من الملعب","capacity":"السعة","homeOf":"ملعب فريق","photo":"الصورة","countdown":"بداية المباراة بعد","detail":"بيانات المباراة","dataPending":"ستظهر الأحداث والتشكيلات والإحصاءات بعد تحقق TouchLine منها.","recent":"التسلسل الزمني الرسمي","form":"التشكيلات المتحقق منها","players":"تقييمات المباراة","archive":"أرشيف TouchLine","provider":"TouchLine Verified","timezone":"التوقيت المحلي","versus":"VS","completed":"انتهت","liveNow":"مباشر","next":"التالية","official":"TouchLine Data","watch":"فتح المباراة","liveDataUpdating":"جارٍ تحديث البيانات المباشرة","liveDataUpdatingCopy":"تُعرض آخر لقطة متحقق منها؛ قد تكون النتيجة متأخرة.","partialScheduleCopy":"الجدول المحفوظ متاح، لكن النتائج المباشرة تنتظر لقطة متحققًا منها.","lastVerified":"آخر بيانات متحقق منها","lastVerifiedAt":"آخر تحقق","events":"أحداث رسمية","scoring":"تقييمات رسمية","lineupAvailable":"التشكيلة متاحة","viewLineup":"عرض التشكيلة","lineupPending":"التشكيلة الرسمية غير متاحة بعد","lineupPendingCopy":"ستظهر التشكيلة هنا عندما تصبح متاحة ويتم التحقق منها.","starters":"الأساسيون","bench":"البدلاء","minutes":"دقيقة","rating":"التقييم","noScoring":"لا يوجد تقييم رسمي","assist":"تمريرة حاسمة","substitutedFor":"بدلًا من","dataUnavailable":"—","highlights":"أبرز المشاركين في المباراة","bestCoach":"المدرب الفائز","bestCards":"أفضل بطاقات المباراة","winnerVerified":"فوز متحقق منه","calculating":"جارٍ التقييم","ratingVerified":"تقييم متحقق منه","season":"الموسم","homeFallback":"المضيف","awayFallback":"الضيف","eventFallback":"حدث","dayUnit":"ي","hourUnit":"س","minuteUnit":"د"},
  "tr-TR": {"title":"Maç merkezi","metadataTitle":"Canlı | TouchLine England","metadataDescription":"TouchLine England canlı maçları, olayları ve istatistikleri.","live":"CANLI","today":"BUGÜN","upcoming":"YAKLAŞAN","finished":"ARŞİV","currentFixtures":"Bu haftanın maçları","recentResults":"Son sonuçlar","matchweek":"Hafta","roundPending":"Hafta TouchLine onayını bekliyor","competition":"TouchLine England","league":"TouchLine England Ligi","england":"İngiltere","select":"Maçlar","alertsSoon":"Maç bildirimleri yakında","selectedFixture":"Seçilen maç","noFixtures":"Fikstür güncelleniyor","noFixturesCopy":"Resmî maçlar, organizasyon kanonik fikstürü yayımladığında gösterilecek.","venue":"Stadyum","venuePending":"TouchLine stadyum doğrulaması bekleniyor","capacity":"Kapasite","homeOf":"Ev sahibi","photo":"Fotoğraf","countdown":"Başlama vuruşuna","detail":"Maç verileri","dataPending":"Olaylar, kadrolar ve istatistikler TouchLine tarafından doğrulandıktan sonra gösterilir.","recent":"Resmî zaman çizelgesi","form":"Doğrulanmış kadrolar","players":"Maç puanları","archive":"TouchLine arşivi","provider":"TouchLine Verified","timezone":"Yerel saat","versus":"VS","completed":"BİTTİ","liveNow":"CANLI","next":"SIRADAKİ","official":"TouchLine Data","watch":"Maçı aç","liveDataUpdating":"Canlı veriler güncelleniyor","liveDataUpdatingCopy":"Son doğrulanmış anlık görüntü gösteriliyor; skor gecikmeli olabilir.","partialScheduleCopy":"Kaydedilmiş fikstür kullanılabilir, ancak canlı skorlar doğrulanmış bir anlık görüntü bekliyor.","lastVerified":"SON DOĞRULANAN","lastVerifiedAt":"Son doğrulama","events":"resmî olay","scoring":"resmî puan","lineupAvailable":"Kadro hazır","viewLineup":"KADROYU GÖR","lineupPending":"Resmî kadro henüz hazır değil","lineupPendingCopy":"Kadro hazır olup doğrulandığında burada gösterilecek.","starters":"İlk 11","bench":"Yedekler","minutes":"DK","rating":"PUAN","noScoring":"Resmî puan yok","assist":"Asist","substitutedFor":"yerine","dataUnavailable":"—","highlights":"Maçın öne çıkanları","bestCoach":"Kazanan teknik direktör","bestCards":"Maçın en iyi kartları","winnerVerified":"Doğrulanmış galibiyet","calculating":"Değerlendiriliyor","ratingVerified":"Doğrulanmış puan","season":"Sezon","homeFallback":"Ev sahibi","awayFallback":"Deplasman","eventFallback":"Olay","dayUnit":"g","hourUnit":"s","minuteUnit":"dk"},
  "de-DE": {"title":"Spielzentrum","metadataTitle":"Live | TouchLine England","metadataDescription":"Live-Spiele, Ereignisse und Statistiken von TouchLine England.","live":"JETZT LIVE","today":"HEUTE","upcoming":"DEMNÄCHST","finished":"ARCHIV","currentFixtures":"Spiele dieser Woche","recentResults":"Letzte Ergebnisse","matchweek":"Spieltag","roundPending":"Spieltag wartet auf TouchLine-Bestätigung","competition":"TouchLine England","league":"TouchLine England-Liga","england":"England","select":"Spiele","alertsSoon":"Spielbenachrichtigungen demnächst","selectedFixture":"Ausgewähltes Spiel","noFixtures":"Spielplan wird aktualisiert","noFixturesCopy":"Offizielle Spiele erscheinen, sobald der Wettbewerb den kanonischen Spielplan veröffentlicht.","venue":"Stadion","venuePending":"TouchLine-Verifizierung des Stadions ausstehend","capacity":"Kapazität","homeOf":"Heimstätte von","photo":"Foto","countdown":"Anstoß in","detail":"Spieldaten","dataPending":"Ereignisse, Aufstellungen und Statistiken erscheinen, sobald TouchLine sie verifiziert hat.","recent":"Offizieller Spielverlauf","form":"Verifizierte Aufstellungen","players":"Spielbewertungen","archive":"TouchLine-Archiv","provider":"TouchLine Verified","timezone":"Ortszeit","versus":"VS","completed":"BEENDET","liveNow":"LIVE","next":"NÄCHSTES","official":"TouchLine Data","watch":"Spiel öffnen","liveDataUpdating":"Live-Daten werden aktualisiert","liveDataUpdatingCopy":"Der letzte verifizierte Stand wird angezeigt; der Spielstand kann verzögert sein.","partialScheduleCopy":"Der gespeicherte Spielplan ist verfügbar, aber Live-Spielstände warten auf einen verifizierten Stand.","lastVerified":"ZULETZT VERIFIZIERT","lastVerifiedAt":"Letzte Verifizierung","events":"offizielle Ereignisse","scoring":"offizielle Bewertungen","lineupAvailable":"Aufstellung verfügbar","viewLineup":"AUFSTELLUNG ANSEHEN","lineupPending":"Offizielle Aufstellung noch nicht verfügbar","lineupPendingCopy":"Die Aufstellung erscheint hier, sobald sie verfügbar und verifiziert ist.","starters":"Startelf","bench":"Ersatzbank","minutes":"MIN","rating":"BEWERTUNG","noScoring":"Keine offizielle Bewertung","assist":"Vorlage","substitutedFor":"für","dataUnavailable":"—","highlights":"Herausragende Spielbeteiligte","bestCoach":"Siegreicher Trainer","bestCards":"Beste Spielkarten","winnerVerified":"Verifizierter Sieg","calculating":"In Auswertung","ratingVerified":"Verifizierte Bewertung","season":"Saison","homeFallback":"Heim","awayFallback":"Gast","eventFallback":"Ereignis","dayUnit":"T","hourUnit":"h","minuteUnit":"m"},
} as const;

const componentSource = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
const escape = (value: string) => renderToStaticMarkup(React.createElement(React.Fragment, null, value));

test("complete eight catalogues retain every EN/PT byte and protected marks", async () => {
  const mod = await load();
  assert.deepEqual(Object.keys(mod.TOUCHLINE_MATCH_CENTRE_CATALOGUES), locales);
  const keys = Object.keys(mod.TOUCHLINE_MATCH_CENTRE_CATALOGUES["en-GB"]);
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_MATCH_CENTRE_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), keys);
    for (const value of Object.values(copy)) if (typeof value === "string") { assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME/); }
    assert.equal(copy.competition, "TouchLine England");
    assert.equal(copy.provider, "TouchLine Verified");
    assert.equal(copy.official, "TouchLine Data");
    assert.match(copy.league, /TouchLine England/);
  }
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const copy = mod.getTouchlineMatchCentreCopy(locale);
    for (const [key, value] of Object.entries(baseline[locale])) assert.equal(copy[key as keyof typeof copy], value, key);
    assert.equal(copy.homeFallback, "Home"); assert.equal(copy.awayFallback, "Away"); assert.equal(copy.eventFallback, "Event");
    assert.equal(copy.season, locale === "pt-BR" ? "Temporada" : "Season");
    assert.deepEqual([copy.dayUnit, copy.hourUnit, copy.minuteUnit], ["d", "h", "m"]);
    for (const n of [0, 1, 2, 3, 11, 100]) {
      assert.equal(copy.eventCount(n), n === 1
        ? (locale === "pt-BR" ? "1 evento oficial" : "1 official event")
        : `${n} ${baseline[locale].events}`);
      assert.equal(copy.ratingCount(n), n === 1
        ? (locale === "pt-BR" ? "1 rating oficial" : "1 official rating")
        : `${n} ${baseline[locale].scoring}`);
    }
  }
});

test("six locales remain gated; draft plural oracles are independent and cover Arabic categories", async () => {
  const mod = await load();
  assert.deepEqual(mod.TOUCHLINE_MATCH_CENTRE_DRAFT_LOCALES, locales.slice(2));
  assert.equal(mod.TOUCHLINE_MATCH_CENTRE_DRAFT_STATUS, "draft");
  for (const locale of [...locales.slice(2), "constructor", "__proto__", "", null, undefined]) assert.equal(mod.getTouchlineMatchCentreCopy(locale), mod.TOUCHLINE_MATCH_CENTRE_CATALOGUES["en-GB"]);
  for (const locale of locales.slice(2)) assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
  const oracles = {
    "es-ES": ["1 evento oficial", "2 eventos oficiales", "1 valoración oficial", "2 valoraciones oficiales"],
    "it-IT": ["1 evento ufficiale", "2 eventi ufficiali", "1 voto ufficiale", "2 voti ufficiali"],
    "fr-FR": ["1 événement officiel", "2 événements officiels", "1 note officielle", "2 notes officielles"],
    "tr-TR": ["1 resmî olay", "2 resmî olay", "1 resmî puan", "2 resmî puan"],
    "de-DE": ["1 offizielles Ereignis", "2 offizielle Ereignisse", "1 offizielle Bewertung", "2 offizielle Bewertungen"],
  };
  for (const [locale, words] of Object.entries(oracles)) {
    const copy = mod.TOUCHLINE_MATCH_CENTRE_CATALOGUES[locale as keyof typeof mod.TOUCHLINE_MATCH_CENTRE_CATALOGUES];
    assert.deepEqual([copy.eventCount(1), copy.eventCount(2), copy.ratingCount(1), copy.ratingCount(2)], words);
  }
  const ar = mod.TOUCHLINE_MATCH_CENTRE_CATALOGUES["ar-SA"];
  assert.deepEqual([0, 1, 2, 3, 11, 100].map(ar.eventCount), ["0 أحداث رسمية", "1 حدث رسمي", "حدثان رسميان", "3 أحداث رسمية", "11 حدثًا رسميًا", "100 حدث رسمي"]);
  assert.deepEqual([0, 1, 2, 3, 11, 100].map(ar.ratingCount), ["0 تقييمات رسمية", "1 تقييم رسمي", "تقييمان رسميان", "3 تقييمات رسمية", "11 تقييمًا رسميًا", "100 تقييم رسمي"]);
});

test("every literal Match Centre key remains authored for each unpublished draft", async () => {
  const mod = await load();
  for (const [locale, expected] of Object.entries(draftStringOracles) as Array<[keyof typeof draftStringOracles, Record<string, string>]>) {
    const actual = Object.fromEntries(Object.entries(mod.TOUCHLINE_MATCH_CENTRE_CATALOGUES[locale]).filter(([, value]) => typeof value === "string"));
    assert.deepEqual(actual, expected, locale);
    assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
    assert.equal(mod.getTouchlineMatchCentreCopy(locale), mod.TOUCHLINE_MATCH_CENTRE_CATALOGUES["en-GB"]);
  }
});

// Whole real JSX; React SSR runs real useState/useMemo and does not run effects.
// Only presentation children/CSS are doubles; scheduling, data admission,
// selection and ordering helpers remain real. No browser/network/timers run.
async function consumer(future = false) {
  const catalogue = await load();
  const captures: { kind: string; props: Record<string, unknown> }[] = [];
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  runInNewContext(ts.transpileModule(componentSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, React, Intl, require: (name: string) => {
      if (name === "react") return React;
      if (name === "lucide-react") return icons;
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === "@/lib/touchlineArena/i18n") return i18n;
      if (name === "@/lib/touchlineArena/catalogue-locale") return catalogueLocale;
      if (name === "@/lib/touchlineArena/match-event-i18n") return matchEvents;
      if (name === "@/lib/touchlineArena/position-labels") return positions;
      if (name === "@/lib/touchlineArena/match-centre-i18n") return catalogue;
      if (name === "@/lib/touchlineArena/match-centre") return match;
      if (name === "@/lib/touchlineArena/demo-data") return clubs;
      if (name === "@/lib/touchlineArena/live-coaches") return coaches;
      if (name === "@/components/logo") return { Logo: (props: Record<string, unknown>) => {
        captures.push({ kind: name, props }); return React.createElement("span", { "data-child": name });
      } };
      if (name.startsWith("@/components/") || name === "./TouchlineFixtureAlerts") return { default: (props: Record<string, unknown>) => {
        captures.push({ kind: name, props }); return React.createElement("span", { "data-child": name });
      } };
      assert.fail(`Unexpected import ${name}`);
    },
    fetch: () => assert.fail("SSR must not fetch"), window: new Proxy({}, { get: () => assert.fail("SSR must not access window") }),
  });
  return { captures, render(locale: string, input: Record<string, unknown> = {}) {
    captures.length = 0;
    const props = { initialFixtures: [fixture()], initialFixtureId: "fixture-1", initialNow: now, initialTimeZone: "Europe/London", initialSeasonName: "2099/00", initialLocale: locale, draftLocalesEnabled: future, ...input };
    const before = JSON.stringify(props);
    const html = renderToStaticMarkup(React.createElement(exports.default!, props));
    assert.equal(JSON.stringify(props), before, "presentation never mutates canonical inputs");
    return html;
  } };
}
const now = Date.parse("2026-10-03T12:00:00Z");
function fixture(changes: Record<string, unknown> = {}) {
  return { id: "fixture-1", providerId: "19722203", seasonId: "2026-27", roundId: "round-6", roundName: "6",
    startsAt: "2026-10-03T11:30:00Z", status: "1st Half", liveMinute: 0, homeScore: 0, awayScore: 0,
    homeTeam: { id: "19", providerId: "19", name: "Arsenal <&>" }, awayTeam: { id: "18", providerId: "18", name: "Chelsea <&>" }, ...changes };
}
function detail() {
  return { fixture: { ...fixture(), id: "19722203" }, capturedAt: "2026-10-03T11:58:00Z", lineupAvailableAt: "2026-10-03T11:00:00Z",
    events: [{ id: "e0", minute: 0, type: "<script>unknown</script>", playerName: "Player <img onerror=x>", relatedPlayerName: "Neutral <&>", teamId: "19" },
      { id: "e1", minute: 1, type: "Substitution", relatedPlayerName: "Official <&>", teamId: "19" },
      { id: "e2", minute: 2, type: "Goal", relatedPlayerName: "Assist <&>", teamId: "18" }],
    lineups: [{ id: "l0", teamId: "19", playerId: "p1", playerName: "Player <img onerror=x>", isStarter: true, jerseyNumber: 0, position: "Unknown <&>" },
      { id: "l1", teamId: "18", playerId: "p2", playerName: "Sub <&>", isStarter: false }],
    playerStatistics: [{ playerId: "p1", playerName: "Player <img onerror=x>", teamId: "19", appearanceStatus: "started", minutes: 0, rating: 0 },
      { playerId: "p2", playerName: "Sub <&>", teamId: "18", appearanceStatus: "substitute", minutes: null, rating: null }],
  };
}

test("real EN/PT SSR retains empty, live, finished, pending/available lineups, stale and partial notices", async () => {
  const view = await consumer();
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const b = baseline[locale];
    for (const text of [b.title, b.lineupPending, b.lineupPendingCopy, "0 — 0", "0′", "2099/2100"]) assert.ok(view.render(locale).includes(escape(text)), text);
    const empty = view.render(locale, { initialFixtures: [] });
    assert.ok(empty.includes(escape(b.noFixturesCopy)));
    const verified = view.render(locale, { initialMatchDetail: detail() });
    for (const text of [b.viewLineup, b.highlights, b.form, b.starters, b.bench, b.assist, b.substitutedFor, ...eventOracles[locale], `3 ${b.events}`, locale === "pt-BR" ? "1 rating oficial" : "1 official rating"]) assert.ok(verified.includes(escape(text)), text);
    assert.ok(verified.includes(escape(`${b.assist}: Assist <&>`)));
    assert.ok(verified.includes(escape(`${b.substitutedFor}: Official <&>`)));
    assert.ok(verified.includes(escape(`${eventOracles[locale][1]}: Neutral <&>`)));
    const missingType = detail();
    delete (missingType.events[2] as { type?: string }).type;
    const neutral = view.render(locale, { initialMatchDetail: missingType });
    assert.ok(neutral.includes(escape(`${eventOracles[locale][1]}: Assist <&>`)), "missing type cannot imply an assist");
    assert.ok(!neutral.includes(escape(`${b.assist}: Assist <&>`)));
    assert.match(verified, /href="#touchline-match-lineups"/); assert.match(verified, /tabindex="-1"/);
    const ended = view.render(locale, { initialFixtures: [fixture({ status: "FT", homeScore: 2, awayScore: 1 })], initialMatchDetail: detail() });
    assert.ok(ended.includes(escape(b.completed))); assert.ok(ended.includes(escape(b.winnerVerified)));
    for (const state of ["persisted-live-snapshot", "partial-persisted-schedule"]) {
      const html = view.render(locale, { initialReadMetadata: { state, degraded: true, fetchedAt: "2026-10-03T11:00:00Z" } });
      assert.match(html, /data-state="stale"/); assert.ok(html.includes(escape(b.lastVerified)));
      assert.ok(html.includes(escape(state === "partial-persisted-schedule" ? b.partialScheduleCopy : b.liveDataUpdatingCopy)));
      assert.ok(html.includes(escape(b.lastVerifiedAt)));
      assert.doesNotMatch(html, /class="statusPill"/);
    }
  }
});

test("fallbacks stay localized; factual names are escaped and unknown provider types stay private", async () => {
  const view = await consumer();
  for (const locale of ["en-GB", "pt-BR"]) {
    const html = view.render(locale, { initialMatchDetail: detail() });
    for (const raw of ["Player <img onerror=x>", "Official <&>", "Neutral <&>", "Assist <&>", "Arsenal <&>", "Unknown <&>"]) assert.ok(html.includes(escape(raw)), raw);
    assert.ok(!html.includes(escape("<script>unknown</script>")), "unknown event type uses neutral display, not private provider vocabulary");
    assert.doesNotMatch(html, /<script>|<img onerror=x>/);
    const noNames = view.render(locale, { initialFixtures: [fixture({ homeTeam: { id: "19", providerId: "19" }, awayTeam: { id: "18", providerId: "18" } })] });
    assert.ok(noNames.includes("Home vs Away"), "approved EN/PT fallback catalogue remains unchanged");
    const noDetail = view.render(locale, { initialMatchDetail: { ...detail(), fixture: { id: "other-fixture" } } });
    assert.doesNotMatch(noDetail, /data-testid="touchline-verified-match-data"/);
  }
});

test("real public SSR still admits EN/PT only, including unknown locale values", async () => {
  const view = await consumer();
  const english = view.render("en-GB", { initialMatchDetail: detail() });
  for (const locale of [...locales.slice(2), "constructor", "__proto__", "unknown", ""]) {
    assert.equal(view.render(locale, { initialMatchDetail: detail() }), english);
  }
});

test("future isolated seam carries complete locale through real JSX, countdown, season, counts and child boundaries", async () => {
  const mod = await load(), view = await consumer(true);
  for (const locale of locales) {
    const copy = mod.TOUCHLINE_MATCH_CENTRE_CATALOGUES[locale];
    const verified = view.render(locale, { initialMatchDetail: detail() });
    for (const text of [copy.title, copy.league, copy.highlights, copy.form, copy.starters, copy.bench, ...eventOracles[locale], copy.eventCount(3), copy.ratingCount(1), `${copy.season} 2099/2100`, copy.viewLineup, copy.lineupAvailable, copy.bestCoach, copy.bestCards, copy.ratingVerified, copy.substitutedFor, copy.assist, copy.minutes, copy.rating, copy.currentFixtures, copy.recentResults, copy.select, copy.selectedFixture, copy.england, copy.venuePending, copy.timezone, copy.dataPending, copy.recent, copy.players, copy.archive]) assert.ok(verified.includes(escape(text)), `${locale}: ${text}`);
    assert.ok(verified.includes(escape(`${copy.assist}: Assist <&>`)), `${locale}: goal assist`);
    assert.ok(verified.includes(escape(`${copy.substitutedFor}: Official <&>`)), `${locale}: substitution relationship`);
    assert.ok(verified.includes(escape(`${eventOracles[locale][1]}: Neutral <&>`)), `${locale}: neutral relationship`);
    assert.ok(!verified.includes(escape("<script>unknown</script>")), `${locale}: private provider type absent`);
    assert.ok(view.captures.some(({ kind, props }) => kind.includes("GlobalNavigation") && props.locale === locale));
    assert.ok(view.captures.some(({ kind, props }) => kind.includes("FixtureAlerts") && props.locale === locale && props.fixtureId === "fixture-1"));
    const upcoming = view.render(locale, { initialFixtures: [fixture({ status: "Not Started", startsAt: "2026-10-04T14:03:00Z", homeScore: undefined, awayScore: undefined })] });
    assert.ok(upcoming.includes(escape(`${copy.countdown} · 1${copy.dayUnit} 02${copy.hourUnit} 03${copy.minuteUnit}`)), `${locale}: ${upcoming.match(/class="countdown"[^<]*/)?.[0]}`);
    assert.match(upcoming, /class="score">VS/);
    const absentNames = view.render(locale, { initialFixtures: [fixture({ homeTeam: { id: "19", providerId: "19" }, awayTeam: { id: "18", providerId: "18" } })] });
    assert.ok(absentNames.includes(escape(`${copy.homeFallback} vs ${copy.awayFallback}`)), locale);
    const empty = view.render(locale, { initialFixtures: [] });
    for (const text of [copy.noFixtures, copy.noFixturesCopy]) assert.ok(empty.includes(escape(text)), locale);
    const pending = view.render(locale);
    for (const text of [copy.lineupPending, copy.lineupPendingCopy, copy.liveNow]) assert.ok(pending.includes(escape(text)), locale);
    for (const state of ["persisted-live-snapshot", "partial-persisted-schedule"]) {
      const stale = view.render(locale, { initialReadMetadata: { state, degraded: true, fetchedAt: "2026-10-03T11:00:00Z" } });
      for (const text of [copy.liveDataUpdating, copy.lastVerified, copy.lastVerifiedAt, state === "partial-persisted-schedule" ? copy.partialScheduleCopy : copy.liveDataUpdatingCopy]) assert.ok(stale.includes(escape(text)), locale);
      assert.doesNotMatch(stale, /class="statusPill"/);
    }
  }
});
