import { tr } from "@/lib/i18n";

/** How better-auth reports a link that is too old or was already used. */
const DEAD_LINK = /^(invalid_token|token_expired)$/i;

/** The `error` better-auth adds to the page address when a link or a Google sign-in fails. */
export function linkError(code: string | null) {
  if (!code) return null;
  if (code === "account_not_linked") return tr("Un compte existe déjà avec cette adresse, créé avec un mot de passe : connecte-toi avec ton mot de passe.");
  if (DEAD_LINK.test(code)) return tr("Le lien a expiré ou a déjà servi.");
  return tr("Connexion impossible pour le moment. Réessaie, ou utilise ton e-mail et ton mot de passe.");
}
