import type { Kind } from "./attribution.ts";

export const APP_LINK_BASE = "https://app.conty.com.br/abrir";

// O redirecionador gera o click_id. O link que chega ao app carrega tudo na query, sem depender de referrer.
export function appLink(kind: Kind, ref: string, clickId: string): string {
  const params = new URLSearchParams({ kind, [kind === "campaign" ? "campaign_id" : "referral_code"]: ref, click_id: clickId });
  return `${APP_LINK_BASE}?${params}`;
}
