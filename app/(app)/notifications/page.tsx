"use client";
import { useSiteLocaleRelease } from "@/components/touchline/SiteLocaleReleaseContext";

import {
  Bell,
  CheckCircle2,
  Clock3,
  Mail,
  Radio,
  Save,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { TouchLineLocale } from "@/lib/touchlineArena/i18n";
import { resolveTouchlineCatalogueLocale } from "@/lib/touchlineArena/catalogue-locale";
import { getTouchlineNotificationCentreCopy, formatTouchlineNotificationActiveCount } from "@/lib/touchlineArena/notification-centre-i18n";

type NotificationSettings = {
  playerRumours: boolean;
  availability: boolean;
  confirmedLineup: boolean;
  goalsAndEvents: boolean;
  selectedLiveMatches: boolean;
  leagueLeadership: boolean;
  transfersAndOffers: boolean;
  creditsPromotionsRewards: boolean;
  accountSecurity: boolean;
  generalComms: boolean;
  scopes: {
    clubs: string[];
    players: string[];
    competitions: string[];
    fixtures: string[];
  };
};

type NotificationChannels = {
  in_app: boolean;
  push: boolean;
  email: boolean;
};

type QuietHours = {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
};

type PreferencesPayload = {
  settings: NotificationSettings;
  channels: NotificationChannels;
  frequency: "realtime" | "hourly_digest" | "daily_digest" | "paused";
  quietHours: QuietHours;
  explicitConsentAt: string | null;
  updatedAt: string | null;
};

type CategoryKey = keyof Omit<NotificationSettings, "scopes">;

const DEFAULT_PREFERENCES: PreferencesPayload = {
  settings: {
    playerRumours: true,
    availability: true,
    confirmedLineup: true,
    goalsAndEvents: true,
    selectedLiveMatches: false,
    leagueLeadership: true,
    transfersAndOffers: true,
    creditsPromotionsRewards: true,
    accountSecurity: true,
    generalComms: false,
    scopes: {
      clubs: [],
      players: [],
      competitions: ["TouchLine England"],
      fixtures: [],
    },
  },
  channels: { in_app: true, push: false, email: false },
  frequency: "realtime",
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "07:00",
    timezone: "UTC",
  },
  explicitConsentAt: null,
  updatedAt: null,
};

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[24px] border border-white/[.09] bg-[#071115]/90 shadow-[0_24px_80px_rgba(0,0,0,.25)] backdrop-blur-xl ${className}`}
    >
      {children}
    </section>
  );
}

function PanelHeading({
  kicker,
  title,
  icon: Icon,
}: {
  kicker: string;
  title: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[.07] px-5 py-4">
      <div>
        <p className="text-[8px] font-black uppercase tracking-[.18em] text-[#a3ff12]">{kicker}</p>
        <h2 className="mt-1 text-lg font-black text-white">{title}</h2>
      </div>
      <span className="grid size-9 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.055] text-cyan-200">
        <Icon size={16} aria-hidden="true" />
      </span>
    </div>
  );
}

function joinScope(values: string[]) {
  return values.join(", ");
}

function splitScope(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

type ConsentObservation = "checking" | "recorded" | "not_recorded" | "unconfirmed";

// Shape validation only. An observed record is not current transport authority,
// device permission, subscription or delivery evidence; no freshness window.
function validNotificationConsentTimestamp(value: unknown): value is string {
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) return false;
  const wallClock = Date.parse(`${value.slice(0, 19)}Z`);
  return Number.isFinite(wallClock) && new Date(wallClock).toISOString().slice(0, 19) === value.slice(0, 19);
}

function observedNotificationConsent(value: unknown): ConsentObservation {
  return value === null ? "not_recorded" : validNotificationConsentTimestamp(value) ? "recorded" : "unconfirmed";
}

function preferenceDate(value: string | null, locale: TouchLineLocale, notSaved: string) {
  if (!value) return notSaved;
  return new Intl.DateTimeFormat(locale, {
    calendar: "gregory",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function NotificationsPage() {
  const siteLocalesEnabled = useSiteLocaleRelease();
  return <NotificationsContent draftLocalesEnabled={siteLocalesEnabled} />;
}

function NotificationsContent({ draftLocalesEnabled = false }: { draftLocalesEnabled?: boolean } = {}) {
  const searchParams = useSearchParams();
  const locale = resolveTouchlineCatalogueLocale(searchParams.get("lang"), draftLocalesEnabled);
  const copy = getTouchlineNotificationCentreCopy(locale, draftLocalesEnabled);
  const categories = useMemo<Array<{ key: CategoryKey; title: string; body: string }>>(() => [
    { key: "playerRumours", title: copy.playerRumoursTitle, body: copy.playerRumoursBody },
    { key: "availability", title: copy.availabilityTitle, body: copy.availabilityBody },
    { key: "confirmedLineup", title: copy.confirmedLineupTitle, body: copy.confirmedLineupBody },
    { key: "goalsAndEvents", title: copy.goalsAndEventsTitle, body: copy.goalsAndEventsBody },
    { key: "selectedLiveMatches", title: copy.selectedLiveMatchesTitle, body: copy.selectedLiveMatchesBody },
    { key: "leagueLeadership", title: copy.leagueLeadershipTitle, body: copy.leagueLeadershipBody },
    { key: "transfersAndOffers", title: copy.transfersAndOffersTitle, body: copy.transfersAndOffersBody },
    { key: "creditsPromotionsRewards", title: copy.creditsPromotionsRewardsTitle, body: copy.creditsPromotionsRewardsBody },
    { key: "accountSecurity", title: copy.accountSecurityTitle, body: copy.accountSecurityBody },
    { key: "generalComms", title: copy.generalCommsTitle, body: copy.generalCommsBody },
  ], [copy]);
  const channels = useMemo<Array<{ key: keyof NotificationChannels; title: string; body: string; icon: LucideIcon }>>(() => [
    { key: "in_app", title: copy.in_appTitle, body: copy.in_appBody, icon: Bell },
    { key: "push", title: copy.pushTitle, body: copy.pushBody, icon: Smartphone },
    { key: "email", title: copy.emailTitle, body: copy.emailBody, icon: Mail },
  ], [copy]);
  const [preferences, setPreferences] = useState<PreferencesPayload>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>(copy.loadingPreferences);
  const [consentObservation, setConsentObservation] = useState<{ locale: string; state: ConsentObservation }>({ locale, state: "checking" });
  const consentOperation = useRef({ sequence: 0, live: true });
  const consentState = consentObservation.locale === locale ? consentObservation.state : "checking";
  const consentLabel = consentState === "checking" ? copy.consentChecking
    : consentState === "recorded" ? copy.consentRecorded
      : consentState === "not_recorded" ? copy.consentNotRecorded : copy.consentUnconfirmed;

  function beginConsentObservation() {
    const operation = ++consentOperation.current.sequence;
    setConsentObservation({ locale, state: "checking" });
    return operation;
  }
  function finishConsentObservation(operation: number, state: ConsentObservation) {
    // Fence only this indicator, not the existing preferences or account model.
    if (consentOperation.current.live && consentOperation.current.sequence === operation) {
      setConsentObservation({ locale, state });
    }
  }

  const selectedCategories = useMemo(
    () => categories.filter((category) => preferences.settings[category.key]).length,
    [categories, preferences.settings],
  );

  useEffect(() => {
    const controller = new AbortController();
    const consentRef = consentOperation.current;
    consentRef.live = true;
    // The locale-keyed projection already renders "checking" until this
    // asynchronous read settles; avoid a synchronous state update in the effect.
    const observation = ++consentRef.sequence;

    async function loadPreferences() {
      try {
        const response = await fetch("/api/notifications/preferences", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as
          | { ok: true; data: PreferencesPayload }
          | { ok: false; error?: string };

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.ok === false ? payload.error ?? "Preferences unavailable" : "Preferences unavailable");
        }

        setPreferences(payload.data);
        setMessage(
          payload.data.updatedAt
            ? `${copy.lastSaved} ${preferenceDate(payload.data.updatedAt, locale, copy.notSaved)}`
            : copy.defaults,
        );
        if (consentRef.live && consentRef.sequence === observation) {
          setConsentObservation({ locale, state: observedNotificationConsent(payload.data.explicitConsentAt) });
        }
      } catch (_error) {
        if (controller.signal.aborted) return;
        setMessage(copy.unavailable);
        if (consentRef.live && consentRef.sequence === observation) {
          setConsentObservation({ locale, state: "unconfirmed" });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadPreferences();
    return () => {
      controller.abort();
      consentRef.live = false;
      consentRef.sequence++;
    };
  }, [copy.defaults, copy.lastSaved, copy.notSaved, copy.unavailable, locale]);

  function updateCategory(key: CategoryKey, checked: boolean) {
    setPreferences((current) => ({
      ...current,
      settings: { ...current.settings, [key]: checked },
    }));
  }

  function updateChannel(key: keyof NotificationChannels, checked: boolean) {
    setPreferences((current) => ({
      ...current,
      channels: { ...current.channels, [key]: checked },
    }));
  }

  function updateScope(key: keyof NotificationSettings["scopes"], value: string) {
    setPreferences((current) => ({
      ...current,
      settings: {
        ...current.settings,
        scopes: {
          ...current.settings.scopes,
          [key]: splitScope(value),
        },
      },
    }));
  }

  async function savePreferences() {
    const observation = beginConsentObservation();
    setSaving(true);
    setMessage(copy.savingPreferences);

    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...preferences, explicitConsent: true }),
      });
      const payload = await response.json() as
        | { ok: true; data: PreferencesPayload }
        | { ok: false; error?: string };

      if (!response.ok || payload.ok === false) {
        throw new Error(copy.saveFailed);
      }

      setPreferences(payload.data);
      setMessage(`${copy.saved} ${preferenceDate(payload.data.updatedAt, locale, copy.notSaved)}`);
      finishConsentObservation(observation, observedNotificationConsent(payload.data.explicitConsentAt));
    } catch (_error) {
      setMessage(copy.saveFailed);
      finishConsentObservation(observation, "unconfirmed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir={locale === "ar-SA" ? "rtl" : "ltr"} className="mx-auto max-w-[1500px]">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#caff72]">
            {copy.preferences}
          </span>
          <span className="text-[8px] font-bold uppercase tracking-[.14em] text-slate-600">
            {copy.consentFirst}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-black italic text-white sm:text-[42px]">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">
          {copy.description}
        </p>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4">
          <Bell size={16} className="text-cyan-200" />
          <p className="mt-3 text-[8px] font-black uppercase tracking-[.15em] text-slate-600">{copy.categories}</p>
          <p className="mt-1 text-2xl font-black text-white">{categories.length}</p>
        </div>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4">
          <ShieldCheck size={16} className="text-[#a3ff12]" />
          <p className="mt-3 text-[8px] font-black uppercase tracking-[.15em] text-slate-600">{copy.consent}</p>
          <p className="mt-1 text-2xl font-black text-white" aria-live="polite">{consentLabel}</p>
          <p className="mt-2 text-xs leading-6 text-slate-500">{copy.consentNotice}</p>
        </div>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4">
          <CheckCircle2 size={16} className="text-amber-200" />
          <p className="mt-3 text-[8px] font-black uppercase tracking-[.15em] text-slate-600">{copy.status}</p>
          <p className="mt-1 truncate text-sm font-black text-white" aria-live="polite">
            {loading ? copy.loading : message}
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Panel>
          <PanelHeading kicker={copy.consentCenter} title={copy.notificationCategories} icon={Bell} />
          <div className="grid gap-3 p-5 md:grid-cols-2">
            {categories.map((category) => (
              <label
                key={category.key}
                className="flex min-h-[116px] cursor-pointer items-start gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-cyan-300/25 hover:bg-cyan-300/[.04]"
              >
                <input
                  type="checkbox"
                  checked={preferences.settings[category.key]}
                  onChange={(event) => updateCategory(category.key, event.target.checked)}
                  className="mt-1 size-4 accent-[#a3ff12]"
                />
                <span>
                  <span className="block text-[10px] font-black text-white">{category.title}</span>
                  <span className="mt-1 block text-[9px] leading-5 text-slate-500">{category.body}</span>
                </span>
              </label>
            ))}
          </div>
        </Panel>

        <div className="grid content-start gap-5">
          <Panel>
            <PanelHeading kicker={copy.channels} title={copy.deliveryControls} icon={Radio} />
            <div className="grid gap-3 p-5">
              {channels.map(({ key, title, body, icon: Icon }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4"
                >
                  <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-200">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-black text-white">{title}</span>
                    <span className="mt-1 block text-[9px] leading-5 text-slate-500">{body}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.channels[key]}
                    onChange={(event) => updateChannel(key, event.target.checked)}
                    className="size-4 accent-[#a3ff12]"
                  />
                </label>
              ))}
              <p className="rounded-2xl border border-amber-300/15 bg-amber-300/[.055] p-3 text-[10px] leading-5 text-amber-100/80">
                {copy.pushNotice}
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeading kicker={copy.frequency} title={copy.quietTime} icon={Clock3} />
            <div className="grid gap-3 p-5">
              <label className="grid gap-2 text-[8px] font-black uppercase tracking-[.12em] text-slate-500">
                {copy.deliveryFrequency}
                <select
                  value={preferences.frequency}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    frequency: event.target.value as PreferencesPayload["frequency"],
                  }))}
                  className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold normal-case tracking-normal text-white"
                >
                  <option value="realtime">{copy.realtime}</option>
                  <option value="hourly_digest">{copy.hourly}</option>
                  <option value="daily_digest">{copy.daily}</option>
                  <option value="paused">{copy.paused}</option>
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4 text-[10px] font-black text-white">
                <input
                  type="checkbox"
                  checked={preferences.quietHours.enabled}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    quietHours: { ...current.quietHours, enabled: event.target.checked },
                  }))}
                  className="size-4 accent-[#a3ff12]"
                />
                {copy.quietEnabled}
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  aria-label={copy.quietStart}
                  type="time"
                  value={preferences.quietHours.start}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    quietHours: { ...current.quietHours, start: event.target.value },
                  }))}
                  className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white"
                />
                <input
                  aria-label={copy.quietEnd}
                  type="time"
                  value={preferences.quietHours.end}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    quietHours: { ...current.quietHours, end: event.target.value },
                  }))}
                  className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white"
                />
                <input
                  aria-label={copy.quietTimezone}
                  value={preferences.quietHours.timezone}
                  onChange={(event) => setPreferences((current) => ({
                    ...current,
                    quietHours: { ...current.quietHours, timezone: event.target.value },
                  }))}
                  className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white"
                />
              </div>
            </div>
          </Panel>
        </div>

        <Panel className="xl:col-span-2">
          <PanelHeading kicker={copy.personalScope} title={copy.filters} icon={ShieldCheck} />
          <div className="p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input
                aria-label={copy.clubs}
                value={joinScope(preferences.settings.scopes.clubs)}
                onChange={(event) => updateScope("clubs", event.target.value)}
                placeholder={copy.clubsPlaceholder}
                className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white placeholder:text-slate-700"
              />
              <input
                aria-label={copy.players}
                value={joinScope(preferences.settings.scopes.players)}
                onChange={(event) => updateScope("players", event.target.value)}
                placeholder={copy.playersPlaceholder}
                className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white placeholder:text-slate-700"
              />
              <input
                aria-label={copy.competitions}
                value={joinScope(preferences.settings.scopes.competitions)}
                onChange={(event) => updateScope("competitions", event.target.value)}
                placeholder={copy.competitionsPlaceholder}
                className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white placeholder:text-slate-700"
              />
              <input
                aria-label={copy.fixtures}
                value={joinScope(preferences.settings.scopes.fixtures)}
                onChange={(event) => updateScope("fixtures", event.target.value)}
                placeholder={copy.fixturesPlaceholder}
                className="h-11 rounded-2xl border border-white/[.08] bg-black/30 px-3 text-xs font-bold text-white placeholder:text-slate-700"
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black text-white">{formatTouchlineNotificationActiveCount(selectedCategories, locale, draftLocalesEnabled)}</p>
                <p className="mt-1 text-[9px] leading-5 text-slate-500" aria-live="polite">
                  {loading ? copy.loadingPreferences : message}
                </p>
              </div>
              <button
                type="button"
                onClick={savePreferences}
                disabled={saving || loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#a3ff12] px-5 text-[9px] font-black text-[#071007] transition hover:bg-[#b5ff41] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {consentState === "recorded" ? <CheckCircle2 size={14} /> : <Save size={14} />}
                {saving ? copy.saving : copy.save}
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
