// js/pages/games-import-export.js
import { gameExportSnapshot, gameTransferType as safeType } from "../../shared/js/core/game-transfer-format.js?v=v2026-10-13T00135";
import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-13T00135";
import { t } from "../../shared/translation/translation.js?v=v2026-10-13T00135";

/* =========================================================
	 Helpers (bezpieczne skracanie / typy)
========================================================= */
const safeName = (s) =>
	(String(s ?? t("gamesImportExport.defaults.gameName")).trim() ||
		t("gamesImportExport.defaults.gameName")).slice(0, 80);

const safeQText = (s, i) =>
	(String(s ?? t("gamesImportExport.defaults.question", { ord: i + 1 })).trim() ||
		t("gamesImportExport.defaults.question", { ord: i + 1 })).slice(0, 200);

const safeAText = (s, j) =>
	(String(s ?? t("gamesImportExport.defaults.answer", { ord: j + 1 })).trim() ||
		t("gamesImportExport.defaults.answer", { ord: j + 1 })).slice(0, 17);

const safePts = (v) => {
	const x = Number(v);
	if (!Number.isFinite(x)) return 0;
	return Math.max(0, Math.min(100, Math.floor(x)));
};

/* =========================================================
	 EXPORT GAME
========================================================= */

export async function exportGame(gameId, onProgress) {
	const { data: game, error: gErr } = await sb()
		.from("games")
		.select("id,name,type,status")
		.eq("id", gameId)
		.single();
	if (gErr) throw gErr;

	const { data: questions, error: qErr } = await sb()
		.from("questions")
		.select("id,ord,text,answers(ord,text,fixed_points)")
		.eq("game_id", gameId)
		.order("ord", { ascending: true });
	if (qErr) throw qErr;

	const qs = questions || [];
	const out = gameExportSnapshot(game, qs, t("gamesImportExport.defaults.gameName"));
	if (typeof onProgress === "function") {
		onProgress({ step: t("gamesImportExport.export.step"), i: 0, n: qs.length, msg: "" });
		for (let idx = 0; idx < qs.length; idx++) {
			onProgress({ step: t("gamesImportExport.export.step"), i: idx + 1, n: qs.length,
				msg: qs[idx]?.text ? String(qs[idx].text).slice(0, 60) : "" });
		}
	}

	return out;
}

/* =========================================================
	 IMPORT GAME (definicja gry: games + questions + answers)
========================================================= */

export async function importGame(payload, ownerId, onProgress) {
	if (!payload?.game || !Array.isArray(payload.questions)) {
		throw new Error(t("gamesImportExport.import.invalidFormat"));
	}

	const type = safeType(payload.game.type);
	const name = safeName(payload.game.name);

	const { data: game, error: gErr } = await sb()
		.from("games")
		.insert(
			{
				name,
				type,
				status: "draft",
				owner_id: ownerId,
			},
			{ defaultToNull: false }
		)
		.select("id")
		.single();
	if (gErr) throw gErr;

	// Import nie jest jedną transakcją: gdy coś padnie w połowie, usuwamy
	// utworzoną grę (kaskada zabiera pytania/odpowiedzi) -- wcześniej na liście
	// zostawała niepełna gra, a ponowny import robił drugą o tej samej nazwie.
	try {
		await importQuestions(game.id, payload.questions || [], onProgress);
	} catch (e) {
		const { data: delRes, error: delErr } = await sb().rpc("delete_resource_checked", { p_resource_type: "game", p_resource_id: game.id });
		if (delErr || delRes?.ok === false) console.warn("[import] cleanup failed:", delErr || delRes);
		throw e;
	}

	return game.id;
}

async function importQuestions(gameId, qs, onProgress) {
	const n = qs.length;
	if (typeof onProgress === "function") {
		onProgress({ step: t("gamesImportExport.import.step"), i: 0, n, msg: "" });
	}
	for (let qi = 0; qi < qs.length; qi++) {
		const srcQ = qs[qi] || {};
		const qText = safeQText(srcQ.text, qi);

		const { data: qRow, error: qInsErr } = await sb()
			.from("questions")
			.insert(
				{
					game_id: gameId,
					ord: qi + 1,
					text: qText,
				},
				{ defaultToNull: false }
			)
			.select("id")
			.single();
		if (qInsErr) throw qInsErr;

		// answers_ord_range: w bazie najwyżej 6 odpowiedzi na pytanie -- siódma
		// wywracała cały import (ręcznie poprawiony plik, inny generator)
		const srcA = (Array.isArray(srcQ.answers) ? srcQ.answers : []).slice(0, 6);
		const rows = srcA.map((a, ai) => ({
			question_id: qRow.id,
			ord: ai + 1,
			text: safeAText(a?.text, ai),
			fixed_points: safePts(a?.fixed_points),
		}));

		if (rows.length) {
			const { error: aInsErr } = await sb().from("answers").insert(rows);
			if (aInsErr) throw aInsErr;
		}
		if (typeof onProgress === "function") {
			onProgress({
				step: t("gamesImportExport.import.step"),
				i: qi + 1,
				n,
				msg: qText ? String(qText).slice(0, 60) : "",
			});
		}
	}
}

/* =========================================================
	 DOWNLOAD JSON
========================================================= */

export function downloadJson(filename, obj) {
	// Keep the custom .famgame extension from Android adding ".json" by MIME.
	const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/octet-stream" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// natychmiastowy revoke potrafi w Firefox/Safari przerwać pobieranie
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
