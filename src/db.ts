import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installs (
  device_id TEXT PRIMARY KEY,
  first_opened_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS touches (
  click_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES installs(device_id),
  kind TEXT NOT NULL CHECK (kind IN ('campaign', 'referral')),
  campaign_id TEXT,
  referral_code TEXT,
  touched_at TEXT NOT NULL,
  CHECK ((kind = 'campaign') = (campaign_id IS NOT NULL)),
  CHECK ((kind = 'referral') = (referral_code IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS signups (
  user_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  signed_up_at TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('campaign', 'referral', 'organic')),
  origin_reason TEXT NOT NULL CHECK (origin_reason IN ('last_valid_touch', 'no_install', 'no_touch', 'no_valid_touch')),
  decision TEXT NOT NULL,
  CHECK ((origin = 'organic') = (origin_reason <> 'last_valid_touch'))
);
`;

export function openDatabase(path = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}
