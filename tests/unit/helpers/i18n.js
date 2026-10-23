// Cały słownik języka (suma części web/shared/translation/<lang>/*.js) dla testów.
import { loadDicts } from "../../../scripts/i18n-parts.mjs";

export const dictionaries = await loadDicts();
export const loadDict = async (lang) => dictionaries[lang];
