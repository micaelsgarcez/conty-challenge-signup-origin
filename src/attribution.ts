export type Kind = "campaign" | "referral";
export type Touch = { click_id: string; kind: Kind; ref: string; touched_at: string };
export type Policy = { windowMs: number };
export type Outcome = "won" | "lost" | "ignored";
export type EvaluatedTouch = Touch & { outcome: Outcome; reason: string };

export type Decision = {
  origin: Kind | "organic";
  origin_reason: "last_valid_touch" | "no_install" | "no_touch" | "no_valid_touch";
  winning_click_id: string | null;
  touches: EvaluatedTouch[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_POLICY: Policy = { windowMs: 7 * DAY_MS };

export const RULE = "O toque válido mais recente vence. Empate de horário: indicação vence campanha; mesmo tipo, menor click_id vence.";

// Menor número vence o empate de horário.
const KIND_RANK: Record<Kind, number> = { referral: 0, campaign: 1 };

function ignoredReason(t: Touch, firstOpenedAt: string, signedUpAt: string, policy: Policy): string | null {
  const touched = Date.parse(t.touched_at);
  const windowEnd = Date.parse(firstOpenedAt) + policy.windowMs;
  if (touched < Date.parse(firstOpenedAt)) return "Toque antes da primeira abertura do app.";
  if (touched > Date.parse(signedUpAt)) return "Toque depois do cadastro.";
  if (touched > windowEnd) {
    return `Fora da janela de ${policy.windowMs / DAY_MS} dias contada da primeira abertura (até ${new Date(windowEnd).toISOString()}).`;
  }
  return null;
}

// Ordem de vitória: horário mais recente, depois indicação antes de campanha, depois menor click_id.
function compareWinner(a: Touch, b: Touch): number {
  return (
    Date.parse(b.touched_at) - Date.parse(a.touched_at) ||
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    (a.click_id < b.click_id ? -1 : a.click_id > b.click_id ? 1 : 0)
  );
}

function lostReason(t: Touch, winner: Touch): string {
  if (t.touched_at !== winner.touched_at) return `Perdeu para ${winner.click_id}: toque mais recente vence.`;
  if (t.kind !== winner.kind) return `Empate de horário com ${winner.click_id}: indicação vence campanha.`;
  return `Empate de horário e de tipo com ${winner.click_id}: menor click_id vence.`;
}

export function decide(touches: Touch[], firstOpenedAt: string | null, signedUpAt: string, policy: Policy): Decision {
  if (firstOpenedAt === null) {
    return { origin: "organic", origin_reason: "no_install", winning_click_id: null, touches: [] };
  }
  const ignored = new Map<string, string>();
  for (const t of touches) {
    const reason = ignoredReason(t, firstOpenedAt, signedUpAt, policy);
    if (reason) ignored.set(t.click_id, reason);
  }
  const valid = touches.filter((t) => !ignored.has(t.click_id)).sort(compareWinner);
  const winner = valid[0];

  const chronological = [...touches].sort((a, b) => compareWinner(b, a));
  const evaluated = chronological.map((t): EvaluatedTouch => {
    const reason = ignored.get(t.click_id);
    if (reason) return { ...t, outcome: "ignored", reason };
    if (t !== winner) return { ...t, outcome: "lost", reason: lostReason(t, winner!) };
    const tied = valid[1];
    const reasonWon = tied && tied.touched_at === t.touched_at ? `Venceu o empate de horário com ${tied.click_id}: ${tieRule(t, tied)}` : "Toque válido mais recente.";
    return { ...t, outcome: "won", reason: reasonWon };
  });

  if (!winner) {
    return { origin: "organic", origin_reason: touches.length === 0 ? "no_touch" : "no_valid_touch", winning_click_id: null, touches: evaluated };
  }
  return { origin: winner.kind, origin_reason: "last_valid_touch", winning_click_id: winner.click_id, touches: evaluated };
}

function tieRule(winner: Touch, other: Touch): string {
  return winner.kind !== other.kind ? "indicação vence campanha." : "menor click_id vence.";
}
