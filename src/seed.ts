import type { DatabaseSync } from "node:sqlite";

export function seed(db: DatabaseSync): void {
  db.exec(`
    INSERT OR IGNORE INTO campaigns (id, name) VALUES
      ('cmp_verao', 'Campanha de verão'),
      ('cmp_creators_br', 'Criadores do Brasil');
    INSERT OR IGNORE INTO referral_codes (code, owner_user_id) VALUES
      ('ANA10', 'usr_ana'),
      ('BRUNO7', 'usr_bruno');
  `);
}
