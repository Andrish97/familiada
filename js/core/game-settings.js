// js/core/game-settings.js
// Shared module for loading and saving per-game settings.
// No existing code imports this — safe to add without side effects.

import { sb } from "./supabase.js?v=v2026-06-11T21213";

/* ========= DEFAULTS ========= */

const DEFAULT_TEAM_NAMES = {
  pl: { nameA: "Drużyna A",  nameB: "Drużyna B" },
  en: { nameA: "Team A",     nameB: "Team B" },
  uk: { nameA: "Команда А",  nameB: "Команда Б" },
};

export function getDefaults(locale = "pl") {
  const teams = DEFAULT_TEAM_NAMES[locale] ?? DEFAULT_TEAM_NAMES.pl;
  return {
    teams: {
      nameA: teams.nameA,
      nameB: teams.nameB,
    },
    display: {
      logoId:    null,
      frameMode: "classic",
      theme:     "classic",
      colors: {
        A:          "#c4002f",
        B:          "#2a62ff",
        BACKGROUND: "#d21180",
        DOT:        "#d7ff3d",
      },
    },
    sound: {
      volumes: {
        show_intro:         100,
        round_transition:   100,
        round_transition2:  100,
        final_theme:        100,
        buzzer_press:       100,
        answer_correct:     100,
        answer_wrong:       100,
        answer_repeat:      100,
        time_over:          100,
        bells:              100,
      },
      variants:  {},
      cloudSave: false,
    },
    questions: {
      mode:        "random",
      count:       3,
      selectedIds: [],
      roundsCount: 3,
      hasFinal:    false,
      finaleMode:  "random",
      finaleCount: 5,
      finaleIds:   [],
    },
    game: {
      roundMultipliers: [1, 1, 1, 2, 3],
      finalMinPoints:   300,
      finalTarget:      200,
      endMode:          "logo",
      prizeMultiplier:  3,
      prizeAmount:      25000,
    },
  };
}

/* ========= DEEP MERGE ========= */

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(target, source) {
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (isPlainObject(source[key]) && isPlainObject(target[key])) {
      out[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

export function mergeWithDefaults(partial, locale = "pl") {
  return deepMerge(getDefaults(locale), partial ?? {});
}

/* ========= LOAD / SAVE ========= */

export async function loadSettings(gameId, locale = "pl") {
  const { data, error } = await sb()
    .from("games")
    .select("settings")
    .eq("id", gameId)
    .single();

  if (error) {
    console.warn("[game-settings] loadSettings error:", error.message);
    return getDefaults(locale);
  }

  return mergeWithDefaults(data?.settings ?? {}, locale);
}

export async function saveSettings(gameId, settings) {
  const { data, error } = await sb()
    .from("games")
    .update({ settings })
    .eq("id", gameId)
    .select("settings")
    .single();

  if (error) return { error };
  return { data };
}

/* ========= LOGO RESOLVER ========= */

// Returns the logo record ({ id, type, payload, name }) or null for the default logo.
// null means: use the default logo from /display/logo_familiada.json
export async function resolveLogoRecord(logoId, userId) {
  if (!logoId) return null;

  const { data, error } = await sb()
    .from("user_logos")
    .select("id,type,payload,name")
    .eq("id", logoId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    console.warn("[game-settings] resolveLogoRecord: logo not found, using default", logoId);
    return null;
  }

  return data;
}
