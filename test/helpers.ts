import { createApp } from "../src/app.ts";
import type { Policy } from "../src/attribution.ts";
import { openDatabase } from "../src/db.ts";
import { seed } from "../src/seed.ts";

export const T0 = "2026-10-01T12:00:00.000Z";
export const DAY = 24 * 60 * 60 * 1000;

export function setup(options: { policy?: Policy } = {}) {
  let current = new Date(T0);
  const db = openDatabase(":memory:");
  seed(db);
  const app = createApp(db, { now: () => current, ...options });
  return {
    app,
    db,
    at: (iso: string) => {
      current = new Date(iso);
    },
    after: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

export type App = ReturnType<typeof setup>["app"];

export function post(app: App, path: string, body?: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const install = (app: App, device_id: string) => post(app, "/installs", { device_id });

export const campaignTouch = (app: App, device_id: string, click_id: string, campaign_id = "cmp_verao") =>
  post(app, "/touches", { device_id, click_id, kind: "campaign", campaign_id });

export const referralTouch = (app: App, device_id: string, click_id: string, referral_code = "ANA10") =>
  post(app, "/touches", { device_id, click_id, kind: "referral", referral_code });

export const signup = (app: App, user_id: string, device_id: string) => post(app, "/signups", { user_id, device_id });

export const getSignup = (app: App, user_id: string) => app.request(`/signups/${user_id}`);
