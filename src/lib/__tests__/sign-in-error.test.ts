import { describe, expect, it } from "vitest";
import { linkError } from "../sign-in-error";

describe("sign-in errors", () => {
  it("says nothing without an error", () => {
    expect(linkError(null)).toBeNull();
  });

  it("explains a link that is too old or already used", () => {
    for (const code of ["INVALID_TOKEN", "invalid_token", "TOKEN_EXPIRED"]) expect(linkError(code)).toMatch(/lien a expiré/);
  });

  it("doesn't blame a link when Google fails", () => {
    for (const code of ["invalid_code", "state_mismatch", "access_denied", "unable_to_get_user_info"]) {
      expect(linkError(code)).toMatch(/Connexion impossible/);
    }
  });

  it("points to the password when the address already has an account", () => {
    expect(linkError("account_not_linked")).toMatch(/mot de passe/);
  });
});
