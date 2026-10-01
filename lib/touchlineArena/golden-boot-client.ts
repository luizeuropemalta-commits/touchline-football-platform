"use client";

import { useSyncExternalStore } from "react";
import {
  createGoldenBootClientState, beginGoldenBootClientRequest,
  receiveGoldenBootClientResponse, failGoldenBootClientRequest,
  tickGoldenBootClient, revokeGoldenBootClient,
} from "./golden-boot-client-state";

const EMPTY: readonly string[] = Object.freeze([]);
const URL = "/api/touchline-awards/golden-boot";
let state = createGoldenBootClientState();
let snapshot = EMPTY;
const listeners = new Set<() => void>();
let refreshTimer: number | null = null;
let expiryTimer: number | null = null;
let active: { id: number; controller: AbortController; deadline: number } | null = null;
const now = () => performance.now();
const usable = () => typeof window !== "undefined" && document.visibilityState === "visible" && navigator.onLine !== false;
const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;
const noSubscription = () => () => undefined;

function publish() {
  const next = state.authority?.current?.playerIds ?? EMPTY;
  if (next === snapshot) return;
  // Authority revisions and expiry still advance in state. Cards only need a
  // new render snapshot when the actual leaders change, not on every refresh.
  if (next.length === snapshot.length && next.every((id, index) => id === snapshot[index])) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}

function clearTimers() {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  refreshTimer = expiryTimer = null;
}

function scheduleExpiry() {
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  expiryTimer = null;
  const current = state.authority?.current;
  if (!current || !state.clock || !listeners.size) return;
  const serverNow = state.clock.serverNowMs + now() - state.clock.performanceMs;
  const remaining = Date.parse(current.expiresAt!) - serverNow;
  expiryTimer = window.setTimeout(() => {
    expiryTimer = null;
    state = tickGoldenBootClient(state, now());
    publish();
    scheduleExpiry();
  }, Math.max(1, Math.ceil(remaining)));
}

function suspend() {
  clearTimers();
  if (active) {
    window.clearTimeout(active.deadline);
    active.controller.abort();
    active = null;
  }
  state = revokeGoldenBootClient(state, now());
  publish();
}

function load() {
  if (!listeners.size || !usable() || active) return;
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = null;
  const request = beginGoldenBootClientRequest(state, now());
  state = request.state;
  publish();
  if (request.requestId === null) return;
  const id = request.requestId;
  const controller = new AbortController();
  let deadline = 0;
  const timeout = new Promise<null>(resolve => {
    deadline = window.setTimeout(() => { resolve(null); controller.abort(); }, 5_000);
  });
  active = { id, controller, deadline };
  // One request for all mounted cards. Race includes JSON parsing and remains
  // bounded even when an implementation ignores the AbortSignal.
  const response = Promise.resolve().then(async () => {
    const result = await fetch(URL, { cache: "no-store", signal: controller.signal });
    return result.ok ? await result.json() as unknown : null;
  });
  void Promise.race([response, timeout]).then(payload => {
    if (active?.id !== id) return;
    state = controller.signal.aborted || !usable()
      ? failGoldenBootClientRequest(state, id, now())
      : receiveGoldenBootClientResponse(state, id, payload, now());
  }, () => {
    if (active?.id === id) state = failGoldenBootClientRequest(state, id, now());
  }).finally(() => {
    window.clearTimeout(deadline);
    if (active?.id !== id) return;
    active = null;
    publish();
    scheduleExpiry();
    if (listeners.size && usable()) refreshTimer = window.setTimeout(load, snapshot.length ? 10_000 : 30_000);
  });
}

function visibilityChanged() {
  if (!usable()) suspend();
  else { state = tickGoldenBootClient(state, now()); publish(); scheduleExpiry(); load(); }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("offline", visibilityChanged);
    window.addEventListener("online", visibilityChanged);
    window.addEventListener("pageshow", visibilityChanged);
    window.addEventListener("pagehide", suspend);
    visibilityChanged();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.removeEventListener("offline", visibilityChanged);
    window.removeEventListener("online", visibilityChanged);
    window.removeEventListener("pageshow", visibilityChanged);
    window.removeEventListener("pagehide", suspend);
    suspend();
  };
}

/** Public card callers must also enforce their canonical publication/path gate.
 * This hook supplies IDs only; it never changes player points or crown state. */
export function useTouchlineGoldenBootPlayers(enabled: boolean): readonly string[] {
  return useSyncExternalStore(enabled ? subscribe : noSubscription,
    enabled ? getSnapshot : getServerSnapshot, getServerSnapshot);
}
