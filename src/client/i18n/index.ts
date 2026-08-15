import { en, fr, type Message, type MessageKey } from "./messages";

export type { MessageKey };
export type Locale = "en" | "fr";

const DICTS: Record<Locale, Record<MessageKey, Message>> = { en, fr };

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

export const isLocale = (v: unknown): v is Locale => v === "en" || v === "fr";

export const detectLocale = (): Locale =>
  typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("fr")
    ? "fr"
    : "en";

export type Vars = Record<string, string | number>;

// en/fr only need the one/other categories; extend Plural for locales with more CLDR forms.
const selectForm = ({
  msg,
  locale,
  count,
}: {
  msg: Message;
  locale: Locale;
  count: number | undefined;
}): string => {
  if (typeof msg === "string") return msg;
  if (count === undefined) return msg.other;
  return new Intl.PluralRules(locale).select(count) === "one" ? msg.one : msg.other;
};

export const translate = ({
  locale,
  key,
  vars,
}: {
  locale: Locale;
  key: MessageKey;
  vars?: Vars;
}): string => {
  const count = typeof vars?.count === "number" ? vars.count : undefined;
  let s = selectForm({ msg: DICTS[locale][key], locale, count });
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]));
  return s;
};
