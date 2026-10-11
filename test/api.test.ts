import { describe, expect, it } from "vitest";
import { campaignTouch, DAY, getSignup, install, post, referralTouch, setup, signup, T0 } from "./helpers.ts";

describe("link de campanha e de indicação", () => {
  it("o redirecionador gera o click_id e leva tudo na query, sem depender de referrer", async () => {
    const { app } = setup();
    const res = await app.request("/r?kind=campaign&campaign_id=cmp_verao");
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(`${url.origin}${url.pathname}`).toBe("https://app.conty.com.br/abrir");
    expect(url.searchParams.get("kind")).toBe("campaign");
    expect(url.searchParams.get("campaign_id")).toBe("cmp_verao");
    expect(url.searchParams.get("click_id")).toMatch(/^clk_[0-9a-f-]{36}$/);
  });

  it("link de indicação leva o código", async () => {
    const { app } = setup();
    const res = await app.request("/r?kind=referral&referral_code=ANA10");
    const url = new URL(res.headers.get("location")!);
    expect(url.searchParams.get("kind")).toBe("referral");
    expect(url.searchParams.get("referral_code")).toBe("ANA10");
    expect(url.searchParams.get("click_id")).toMatch(/^clk_/);
  });

  it("cada clique no redirecionador recebe um click_id novo", async () => {
    const { app } = setup();
    const a = new URL((await app.request("/r?kind=campaign&campaign_id=cmp_verao")).headers.get("location")!);
    const b = new URL((await app.request("/r?kind=campaign&campaign_id=cmp_verao")).headers.get("location")!);
    expect(a.searchParams.get("click_id")).not.toBe(b.searchParams.get("click_id"));
  });

  it("campanha ou código desconhecido dá 404, e kind inválido dá 422", async () => {
    const { app } = setup();
    const unknown = await app.request("/r?kind=campaign&campaign_id=cmp_nao_existe");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "Campanha ou código de indicação não encontrado.", code: "link_target_not_found" });
    const bad = await app.request("/r?kind=banner&campaign_id=cmp_verao");
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: "O kind deve ser campaign ou referral.", code: "kind_invalid" });
  });
});

describe("primeira abertura", () => {
  it("grava uma vez só: abrir de novo não muda first_opened_at", async () => {
    const { app, after } = setup();
    const first = await install(app, "dev_1");
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ device_id: "dev_1", first_opened_at: T0 });
    after(3 * DAY);
    const again = await install(app, "dev_1");
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ device_id: "dev_1", first_opened_at: T0 });
  });

  it("toque de dispositivo sem primeira abertura dá 404 install_not_found", async () => {
    const { app } = setup();
    const res = await campaignTouch(app, "dev_x", "clk_1");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "O dispositivo ainda não registrou a primeira abertura do app.", code: "install_not_found" });
  });
});

describe("clique repetido", () => {
  it("o mesmo click_id não cria duas origens: uma linha, mesmo touched_at, mesma origem", async () => {
    const { app, db, after } = setup();
    await install(app, "dev_1");
    after(1000);
    const first = await campaignTouch(app, "dev_1", "clk_1");
    expect(first.status).toBe(201);
    after(60_000);
    const again = await campaignTouch(app, "dev_1", "clk_1");
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(await first.json());
    expect(db.prepare("SELECT COUNT(*) AS n FROM touches").get()).toEqual({ n: 1 });

    const res = await signup(app, "usr_1", "dev_1");
    const body = await res.json();
    expect(body.origin).toBe("campaign");
    expect(body.touches).toHaveLength(1);
  });

  it("o mesmo click_id vindo de outro dispositivo dá 409 e não cria toque", async () => {
    const { app, db } = setup();
    await install(app, "dev_1");
    await install(app, "dev_2");
    await campaignTouch(app, "dev_1", "clk_1");
    const res = await campaignTouch(app, "dev_2", "clk_1");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Esse click_id já foi registrado por outro dispositivo.", code: "click_id_conflict" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM touches").get()).toEqual({ n: 1 });
  });

  it("o banco recusa dois toques com o mesmo click_id", async () => {
    const { db } = setup();
    db.prepare("INSERT INTO installs VALUES ('dev_1', ?)").run(T0);
    const insert = () => db.prepare("INSERT INTO touches VALUES ('clk_1', 'dev_1', 'campaign', 'cmp_verao', NULL, ?)").run(T0);
    insert();
    expect(insert).toThrow(/UNIQUE/);
  });
});

describe("cadastro", () => {
  it("dois links antes do cadastro: o mais recente vence e a resposta mostra os dois toques com o motivo", async () => {
    const { app, after } = setup();
    await install(app, "dev_1");
    after(60 * 60 * 1000);
    await campaignTouch(app, "dev_1", "clk_camp");
    after(24 * 60 * 60 * 1000);
    await referralTouch(app, "dev_1", "clk_ref");
    after(60 * 60 * 1000);

    const res = await signup(app, "usr_1", "dev_1");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      user_id: "usr_1",
      device_id: "dev_1",
      signed_up_at: "2026-10-02T14:00:00.000Z",
      origin: "referral",
      origin_reason: "last_valid_touch",
      winning_click_id: "clk_ref",
      first_opened_at: T0,
      window_ms: 7 * DAY,
      window_ends_at: "2026-10-08T12:00:00.000Z",
      rule: "O toque válido mais recente vence. Empate de horário: indicação vence campanha; mesmo tipo, menor click_id vence.",
      touches: [
        {
          click_id: "clk_camp",
          kind: "campaign",
          ref: "cmp_verao",
          touched_at: "2026-10-01T13:00:00.000Z",
          outcome: "lost",
          reason: "Perdeu para clk_ref: toque mais recente vence.",
        },
        {
          click_id: "clk_ref",
          kind: "referral",
          ref: "ANA10",
          touched_at: "2026-10-02T13:00:00.000Z",
          outcome: "won",
          reason: "Toque válido mais recente.",
        },
      ],
    });
  });

  it("empate de horário no relógio: indicação vence campanha", async () => {
    const { app, after } = setup();
    await install(app, "dev_1");
    after(1000);
    await campaignTouch(app, "dev_1", "clk_a");
    await referralTouch(app, "dev_1", "clk_z");
    const body = await (await signup(app, "usr_1", "dev_1")).json();
    expect(body.winning_click_id).toBe("clk_z");
    expect(body.origin).toBe("referral");
  });

  it("cadastro sem toque é orgânico, com o motivo gravado", async () => {
    const { app, db, after } = setup();
    await install(app, "dev_1");
    after(1000);
    const res = await signup(app, "usr_1", "dev_1");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ origin: "organic", origin_reason: "no_touch", winning_click_id: null, touches: [] });
    expect(db.prepare("SELECT origin, origin_reason FROM signups").get()).toEqual({ origin: "organic", origin_reason: "no_touch" });
  });

  it("cadastro sem primeira abertura registrada é orgânico com motivo no_install", async () => {
    const { app } = setup();
    const body = await (await signup(app, "usr_1", "dev_fantasma")).json();
    expect(body).toMatchObject({ origin: "organic", origin_reason: "no_install", first_opened_at: null, window_ends_at: null });
  });

  it("toque fora da janela vira ignorado e o cadastro fica orgânico com motivo no_valid_touch", async () => {
    const { app, at } = setup();
    await install(app, "dev_1");
    at("2026-10-08T12:00:00.001Z");
    await campaignTouch(app, "dev_1", "clk_tarde");
    at("2026-10-09T12:00:00.000Z");
    const body = await (await signup(app, "usr_1", "dev_1")).json();
    expect(body.origin).toBe("organic");
    expect(body.origin_reason).toBe("no_valid_touch");
    expect(body.touches).toEqual([
      {
        click_id: "clk_tarde",
        kind: "campaign",
        ref: "cmp_verao",
        touched_at: "2026-10-08T12:00:00.001Z",
        outcome: "ignored",
        reason: "Fora da janela de 7 dias contada da primeira abertura (até 2026-10-08T12:00:00.000Z).",
      },
    ]);
  });

  it("a janela é a da política injetada e aparece na resposta", async () => {
    const { app, after } = setup({ policy: { windowMs: 60_000 } });
    await install(app, "dev_1");
    after(61_000);
    await campaignTouch(app, "dev_1", "clk_1");
    const body = await (await signup(app, "usr_1", "dev_1")).json();
    expect(body).toMatchObject({ window_ms: 60_000, window_ends_at: "2026-10-01T12:01:00.000Z", origin: "organic", origin_reason: "no_valid_touch" });
  });

  it("link aberto depois do cadastro não conta: a decisão gravada não muda", async () => {
    const { app, after } = setup();
    await install(app, "dev_1");
    after(1000);
    await campaignTouch(app, "dev_1", "clk_antes");
    after(1000);
    const before = await (await signup(app, "usr_1", "dev_1")).json();
    after(1000);
    const late = await referralTouch(app, "dev_1", "clk_depois");
    expect(late.status).toBe(201);

    const stored = await (await getSignup(app, "usr_1")).json();
    expect(stored).toEqual(before);
    expect(stored.winning_click_id).toBe("clk_antes");
    expect(stored.touches.map((t: { click_id: string }) => t.click_id)).toEqual(["clk_antes"]);
  });

  it("cadastro repetido do mesmo usuário devolve a decisão original com 200", async () => {
    const { app, db, after } = setup();
    await install(app, "dev_1");
    after(1000);
    await campaignTouch(app, "dev_1", "clk_1");
    const first = await signup(app, "usr_1", "dev_1");
    after(DAY);
    await referralTouch(app, "dev_1", "clk_2");
    const again = await signup(app, "usr_1", "dev_1");
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(await first.json());
    expect(db.prepare("SELECT COUNT(*) AS n FROM signups").get()).toEqual({ n: 1 });
  });

  it("o mesmo usuário com outro dispositivo dá 409", async () => {
    const { app } = setup();
    await install(app, "dev_1");
    await signup(app, "usr_1", "dev_1");
    const res = await signup(app, "usr_1", "dev_2");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Esse usuário já tem cadastro com outro dispositivo.", code: "user_already_signed_up" });
  });
});

describe("auditoria", () => {
  it("GET devolve a decisão gravada, não recalculada com a política de hoje", async () => {
    const { app, db, at, after } = setup();
    await install(app, "dev_1");
    after(1000);
    await campaignTouch(app, "dev_1", "clk_1");
    at("2026-10-02T12:00:00.000Z");
    const created = await (await signup(app, "usr_1", "dev_1")).json();
    expect(created.origin).toBe("campaign");

    const { createApp } = await import("../src/app.ts");
    const strict = createApp(db, { now: () => new Date("2026-12-01T00:00:00.000Z"), policy: { windowMs: 1 } });
    const res = await strict.request("/signups/usr_1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  it("cadastro desconhecido dá 404", async () => {
    const { app } = setup();
    const res = await getSignup(app, "usr_nao_existe");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Cadastro não encontrado.", code: "signup_not_found" });
  });
});

describe("validação na borda", () => {
  it.each([
    ["/installs", {}, "device_id_required"],
    ["/touches", { device_id: "d", kind: "campaign", campaign_id: "c" }, "click_id_required"],
    ["/touches", { device_id: "d", click_id: "c", kind: "x" }, "kind_invalid"],
    ["/touches", { device_id: "d", click_id: "c", kind: "campaign" }, "campaign_id_required"],
    ["/touches", { device_id: "d", click_id: "c", kind: "referral", campaign_id: "x" }, "referral_code_required"],
    ["/signups", { device_id: "d" }, "user_id_required"],
    ["/signups", { user_id: "u" }, "device_id_required"],
  ])("%s com %j dá 422 %s", async (path, body, code) => {
    const { app } = setup();
    const res = await post(app, path, body);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe(code);
  });

  it("corpo que não é objeto JSON dá 422 invalid_body", async () => {
    const { app } = setup();
    const res = await app.request("/installs", { method: "POST", body: "lixo" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "O corpo deve ser um objeto JSON válido.", code: "invalid_body" });
  });
});
