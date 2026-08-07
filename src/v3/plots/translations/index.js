'use strict';

// Chart text lives here rather than in the consuming app: the plots own their own vocabulary, so an
// app renders them by passing a language code and carries no chart strings of its own.
//
// Splitting: each locale is a separate module reached through a dynamic import, so a bundler emits
// one chunk per language and a session only ever downloads the language it actually selects.
// English is the exception — it is imported statically because it is the fallback, and a fallback
// that has to be fetched is not a fallback. So the floor is "English only", and every other locale
// is opt-in at runtime. Adding a language means adding a file and one line in LOADERS; nothing
// else in the package changes.
//
// The active locale is module state, set by useLocale() before a render, in the same shape as
// refreshChartTheme() in shared.js — the render functions stay synchronous and read what is
// current, rather than threading a dictionary through every helper.

import en from "./en.js";

const LOADERS = {
  es: () => import("./es.js"),
  fr: () => import("./fr.js")
};

const cache = new Map([["en", en]]);
let active = en;

/** BCP-47 tolerant: "es-MX" and "ES" both resolve to the "es" table. */
const normalize = (lang) => String(lang ?? "en").trim().toLowerCase().split(/[-_]/)[0];

/**
 * Make `lang` the active locale for subsequent renders, fetching its chunk on first use. Falls back
 * to English for an unknown code or a failed load — a chart in the wrong language beats no chart.
 * Resolves to the dictionary now in effect.
 */
async function useLocale(lang) {
  const code = normalize(lang);
  const hit = cache.get(code);
  if (hit) {
    active = hit;
    return active;
  }
  const load = LOADERS[code];
  if (!load) {
    active = en;
    return active;
  }
  try {
    const mod = await load();
    // merged over English so a partial translation renders, rather than showing raw keys
    const dict = {...en, ...(mod.default ?? mod)};
    cache.set(code, dict);
    active = dict;
  } catch {
    active = en;
  }
  return active;
}

/** The language codes this package can render. */
const availableLocales = () => ["en", ...Object.keys(LOADERS)];

/** Look up a string in the active locale. Unknown keys return the key, which is a visible bug. */
const t = (key) => active[key] ?? en[key] ?? key;

/** t() with {placeholder} substitution — `tf("control.yearsShort", {n: 5})`. */
const tf = (key, vars = {}) =>
  String(t(key)).replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));

export {availableLocales, t, tf, useLocale};
