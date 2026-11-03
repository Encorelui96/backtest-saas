import { translate, type Lang } from "@/lib/i18n";

/**
 * An error whose message is meant for the user. `text` is the French text with {0}… placeholders,
 * also the key of its translation: handle() answers in the language of the page.
 */
export class UserError extends Error {
  constructor(
    readonly text: string,
    readonly values: readonly unknown[] = [],
  ) {
    super(translate("fr", text, values));
  }

  in(lang: Lang) {
    return translate(lang, this.text, this.values);
  }
}
