import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import type { Context } from "hono";
import { DEFAULT_POLICY } from "./attribution.ts";
import type { Kind, Policy } from "./attribution.ts";
import { appLink } from "./links.ts";
import * as tracking from "./tracking.ts";
import { TrackingError } from "./tracking.ts";

type Options = { now?: () => Date; policy?: Policy; newClickId?: () => string };
type Body = Record<string, unknown>;

async function readBody(c: Context): Promise<Body> {
  const body: unknown = await c.req.json().catch(() => undefined);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new TrackingError(422, "invalid_body", "O corpo deve ser um objeto JSON válido.");
  }
  return body as Body;
}

function text(value: unknown, code: string, message: string): string {
  if (typeof value === "string" && value.trim() !== "") return value;
  throw new TrackingError(422, code, message);
}

// kind e a referência (campaign_id ou referral_code) vêm juntos, do link ou do corpo do toque.
function linkParams(get: (name: string) => unknown): { kind: Kind; ref: string } {
  const kind = get("kind");
  if (kind === "campaign") return { kind, ref: text(get("campaign_id"), "campaign_id_required", "O campaign_id é obrigatório para kind=campaign.") };
  if (kind === "referral") return { kind, ref: text(get("referral_code"), "referral_code_required", "O referral_code é obrigatório para kind=referral.") };
  throw new TrackingError(422, "kind_invalid", "O kind deve ser campaign ou referral.");
}

export function createApp(db: DatabaseSync, { now = () => new Date(), policy = DEFAULT_POLICY, newClickId = () => `clk_${randomUUID()}` }: Options = {}) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof TrackingError) return c.json({ error: err.message, code: err.code }, err.status);
    console.error(err);
    return c.json({ error: "Erro interno.", code: "internal_error" }, 500);
  });

  app.get("/r", (c) => {
    const { kind, ref } = linkParams((name) => c.req.query(name));
    const table = kind === "campaign" ? "campaigns WHERE id" : "referral_codes WHERE code";
    if (!db.prepare(`SELECT 1 FROM ${table} = ?`).get(ref)) {
      throw new TrackingError(404, "link_target_not_found", "Campanha ou código de indicação não encontrado.");
    }
    return c.redirect(appLink(kind, ref, newClickId()), 302);
  });

  app.post("/installs", async (c) => {
    const body = await readBody(c);
    const { created, install } = tracking.registerInstall(db, text(body.device_id, "device_id_required", "O device_id é obrigatório."), now());
    return c.json(install, created ? 201 : 200);
  });

  app.post("/touches", async (c) => {
    const body = await readBody(c);
    const input = {
      device_id: text(body.device_id, "device_id_required", "O device_id é obrigatório."),
      click_id: text(body.click_id, "click_id_required", "O click_id é obrigatório."),
      ...linkParams((name) => body[name]),
    };
    const { created, touch } = tracking.registerTouch(db, input, now());
    return c.json(touch, created ? 201 : 200);
  });

  app.post("/signups", async (c) => {
    const body = await readBody(c);
    const userId = text(body.user_id, "user_id_required", "O user_id é obrigatório.");
    const deviceId = text(body.device_id, "device_id_required", "O device_id é obrigatório.");
    const { created, signup } = tracking.signUp(db, userId, deviceId, now(), policy);
    return c.json(signup, created ? 201 : 200);
  });

  app.get("/signups/:user_id", (c) => c.json(tracking.getSignup(db, c.req.param("user_id"))));

  return app;
}
