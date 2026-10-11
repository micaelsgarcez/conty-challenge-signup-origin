import type { DatabaseSync } from "node:sqlite";
import { decide, RULE } from "./attribution.ts";
import type { Kind, Policy, Touch } from "./attribution.ts";

export class TrackingError extends Error {
  constructor(
    public status: 404 | 409 | 422,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type TouchRow = { click_id: string; device_id: string; kind: Kind; campaign_id: string | null; referral_code: string | null; touched_at: string };

export type TouchInput = { device_id: string; click_id: string; kind: Kind; ref: string };

export function registerInstall(db: DatabaseSync, deviceId: string, now: Date) {
  const created = db.prepare("INSERT OR IGNORE INTO installs (device_id, first_opened_at) VALUES (?, ?)").run(deviceId, now.toISOString()).changes > 0;
  const row = db.prepare("SELECT first_opened_at FROM installs WHERE device_id = ?").get(deviceId) as { first_opened_at: string };
  return { created, install: { device_id: deviceId, first_opened_at: row.first_opened_at } };
}

function toTouch(row: TouchRow): Touch {
  return { click_id: row.click_id, kind: row.kind, ref: (row.campaign_id ?? row.referral_code)!, touched_at: row.touched_at };
}

function touchView(row: TouchRow) {
  return { device_id: row.device_id, ...(toTouch(row)) };
}

export function registerTouch(db: DatabaseSync, input: TouchInput, now: Date) {
  if (!db.prepare("SELECT 1 FROM installs WHERE device_id = ?").get(input.device_id)) {
    throw new TrackingError(404, "install_not_found", "O dispositivo ainda não registrou a primeira abertura do app.");
  }
  const existing = db.prepare("SELECT * FROM touches WHERE click_id = ?").get(input.click_id) as TouchRow | undefined;
  if (existing) {
    if (existing.device_id !== input.device_id) {
      throw new TrackingError(409, "click_id_conflict", "Esse click_id já foi registrado por outro dispositivo.");
    }
    return { created: false, touch: touchView(existing) };
  }
  const campaignId = input.kind === "campaign" ? input.ref : null;
  const referralCode = input.kind === "referral" ? input.ref : null;
  db.prepare("INSERT INTO touches (click_id, device_id, kind, campaign_id, referral_code, touched_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    input.click_id, input.device_id, input.kind, campaignId, referralCode, now.toISOString(),
  );
  const row = db.prepare("SELECT * FROM touches WHERE click_id = ?").get(input.click_id) as TouchRow;
  return { created: true, touch: touchView(row) };
}

type SignupRow = { user_id: string; device_id: string; signed_up_at: string; decision: string };

function signupView(row: SignupRow) {
  return { user_id: row.user_id, device_id: row.device_id, signed_up_at: row.signed_up_at, ...JSON.parse(row.decision) };
}

export function signUp(db: DatabaseSync, userId: string, deviceId: string, now: Date, policy: Policy) {
  const existing = db.prepare("SELECT * FROM signups WHERE user_id = ?").get(userId) as SignupRow | undefined;
  if (existing) {
    if (existing.device_id !== deviceId) {
      throw new TrackingError(409, "user_already_signed_up", "Esse usuário já tem cadastro com outro dispositivo.");
    }
    return { created: false, signup: signupView(existing) };
  }
  const install = db.prepare("SELECT first_opened_at FROM installs WHERE device_id = ?").get(deviceId) as { first_opened_at: string } | undefined;
  const touches = (db.prepare("SELECT * FROM touches WHERE device_id = ?").all(deviceId) as TouchRow[]).map(toTouch);
  const signedUpAt = now.toISOString();
  const firstOpenedAt = install?.first_opened_at ?? null;
  const decision = decide(touches, firstOpenedAt, signedUpAt, policy);
  const stored = {
    ...decision,
    first_opened_at: firstOpenedAt,
    window_ms: policy.windowMs,
    window_ends_at: firstOpenedAt && new Date(Date.parse(firstOpenedAt) + policy.windowMs).toISOString(),
    rule: RULE,
  };
  db.prepare("INSERT INTO signups (user_id, device_id, signed_up_at, origin, origin_reason, decision) VALUES (?, ?, ?, ?, ?, ?)").run(
    userId, deviceId, signedUpAt, decision.origin, decision.origin_reason, JSON.stringify(stored),
  );
  return { created: true, signup: signupView({ user_id: userId, device_id: deviceId, signed_up_at: signedUpAt, decision: JSON.stringify(stored) }) };
}

export function getSignup(db: DatabaseSync, userId: string) {
  const row = db.prepare("SELECT * FROM signups WHERE user_id = ?").get(userId) as SignupRow | undefined;
  if (!row) throw new TrackingError(404, "signup_not_found", "Cadastro não encontrado.");
  return signupView(row);
}
