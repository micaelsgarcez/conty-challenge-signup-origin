import { describe, expect, it } from "vitest";
import { decide, DEFAULT_POLICY } from "../src/attribution.ts";
import type { Touch } from "../src/attribution.ts";

const OPENED = "2026-10-01T12:00:00.000Z";
const SIGNUP = "2026-10-03T12:00:00.000Z";

const campaign = (click_id: string, touched_at: string): Touch => ({ click_id, kind: "campaign", ref: "cmp_verao", touched_at });
const referral = (click_id: string, touched_at: string): Touch => ({ click_id, kind: "referral", ref: "ANA10", touched_at });

const outcomes = (touches: Touch[], signup = SIGNUP) =>
  Object.fromEntries(decide(touches, OPENED, signup, DEFAULT_POLICY).touches.map((t) => [t.click_id, t.outcome]));

describe("decide: qual toque vence", () => {
  it("dois links diferentes: o toque válido mais recente vence e o outro perde com motivo", () => {
    const d = decide(
      [campaign("clk_a", "2026-10-01T13:00:00.000Z"), referral("clk_b", "2026-10-02T09:00:00.000Z")],
      OPENED,
      SIGNUP,
      DEFAULT_POLICY,
    );
    expect(d.origin).toBe("referral");
    expect(d.origin_reason).toBe("last_valid_touch");
    expect(d.winning_click_id).toBe("clk_b");
    expect(d.touches).toEqual([
      { ...campaign("clk_a", "2026-10-01T13:00:00.000Z"), outcome: "lost", reason: "Perdeu para clk_b: toque mais recente vence." },
      { ...referral("clk_b", "2026-10-02T09:00:00.000Z"), outcome: "won", reason: "Toque válido mais recente." },
    ]);
  });

  it("a ordem de chegada não importa, só o horário do toque", () => {
    const d = decide(
      [referral("clk_b", "2026-10-02T09:00:00.000Z"), campaign("clk_a", "2026-10-01T13:00:00.000Z")],
      OPENED,
      SIGNUP,
      DEFAULT_POLICY,
    );
    expect(d.winning_click_id).toBe("clk_b");
  });

  it("empate de horário: indicação vence campanha, qualquer que seja a ordem", () => {
    const t = "2026-10-02T09:00:00.000Z";
    for (const touches of [[campaign("clk_a", t), referral("clk_z", t)], [referral("clk_z", t), campaign("clk_a", t)]]) {
      const d = decide(touches, OPENED, SIGNUP, DEFAULT_POLICY);
      expect(d.origin).toBe("referral");
      expect(d.winning_click_id).toBe("clk_z");
      expect(d.touches.find((x) => x.click_id === "clk_a")).toMatchObject({
        outcome: "lost",
        reason: "Empate de horário com clk_z: indicação vence campanha.",
      });
      expect(d.touches.find((x) => x.click_id === "clk_z")).toMatchObject({
        outcome: "won",
        reason: "Venceu o empate de horário com clk_a: indicação vence campanha.",
      });
    }
  });

  it("empate de horário e de tipo: o menor click_id vence", () => {
    const t = "2026-10-02T09:00:00.000Z";
    const d = decide([campaign("clk_b", t), campaign("clk_a", t)], OPENED, SIGNUP, DEFAULT_POLICY);
    expect(d.winning_click_id).toBe("clk_a");
    expect(d.touches.find((x) => x.click_id === "clk_b")).toMatchObject({
      outcome: "lost",
      reason: "Empate de horário e de tipo com clk_a: menor click_id vence.",
    });
  });
});

describe("decide: quais toques contam", () => {
  it("toque exatamente no fim da janela vale; 1 ms depois não", () => {
    const end = Date.parse(OPENED) + DEFAULT_POLICY.windowMs;
    const inside = new Date(end).toISOString();
    const outside = new Date(end + 1).toISOString();
    const late = new Date(end + 1000).toISOString();
    expect(outcomes([campaign("clk_in", inside)], late)).toEqual({ clk_in: "won" });
    const d = decide([campaign("clk_out", outside)], OPENED, late, DEFAULT_POLICY);
    expect(d.touches[0]).toMatchObject({
      outcome: "ignored",
      reason: "Fora da janela de 7 dias contada da primeira abertura (até 2026-10-08T12:00:00.000Z).",
    });
    expect(d.origin).toBe("organic");
    expect(d.origin_reason).toBe("no_valid_touch");
  });

  it("a janela conta da primeira abertura, não do toque", () => {
    expect(outcomes([campaign("clk_a", "2026-10-07T11:59:59.000Z")], "2026-10-20T00:00:00.000Z")).toEqual({ clk_a: "won" });
    expect(outcomes([campaign("clk_a", "2026-10-08T12:00:01.000Z")], "2026-10-20T00:00:00.000Z")).toEqual({ clk_a: "ignored" });
  });

  it("toque posterior ao cadastro não vence, nem quando é o mais recente", () => {
    const d = decide(
      [campaign("clk_a", "2026-10-02T09:00:00.000Z"), referral("clk_b", "2026-10-03T12:00:00.001Z")],
      OPENED,
      SIGNUP,
      DEFAULT_POLICY,
    );
    expect(d.winning_click_id).toBe("clk_a");
    expect(d.touches.find((x) => x.click_id === "clk_b")).toMatchObject({ outcome: "ignored", reason: "Toque depois do cadastro." });
  });

  it("toque no mesmo instante do cadastro ainda conta", () => {
    expect(outcomes([campaign("clk_a", SIGNUP)])).toEqual({ clk_a: "won" });
  });

  it("toque antes da primeira abertura não conta", () => {
    const d = decide([campaign("clk_a", "2026-10-01T11:59:59.999Z")], OPENED, SIGNUP, DEFAULT_POLICY);
    expect(d.touches[0]).toMatchObject({ outcome: "ignored", reason: "Toque antes da primeira abertura do app." });
  });

  it("sem toque: orgânico com motivo no_touch", () => {
    expect(decide([], OPENED, SIGNUP, DEFAULT_POLICY)).toEqual({
      origin: "organic",
      origin_reason: "no_touch",
      winning_click_id: null,
      touches: [],
    });
  });

  it("sem primeira abertura registrada: orgânico com motivo no_install", () => {
    expect(decide([], null, SIGNUP, DEFAULT_POLICY)).toMatchObject({ origin: "organic", origin_reason: "no_install" });
  });

  it("a janela vem da política recebida", () => {
    const d = decide([campaign("clk_a", "2026-10-01T12:00:00.002Z")], OPENED, SIGNUP, { windowMs: 1 });
    expect(d.touches[0]!.outcome).toBe("ignored");
  });
});
