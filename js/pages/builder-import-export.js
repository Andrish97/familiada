// js/pages/builder-import-export.js
import { sb } from "../core/supabase.js?v=v2026-04-24T16170";
import { t } from "../../translation/translation.js?v=v2026-04-24T16170";

/* =========================================================
	 Helpers (bezpieczne skracanie / typy)
========================================================= */
const safeName = (s) =>
	(String(s ?? t("builderImportExport.defaults.gameName")).trim() ||
		t("builderImportExport.defaults.gameName")).slice(0, 80);

const safeType = (k) => {
	const v = String(k || "");
	if (v === "poll_text" || v === "poll_points" || v === "prepared") return v;
	return "poll_text";
};

const safeQText = (s, i) =>
	(String(s ?? t("builderImportExport.defaults.question", { ord: i + 1 })).trim() ||
		t("builderImportExport.defaults.question", { ord: i + 1 })).slice(0, 200);

const safeAText = (s, j) =>
	(String(s ?? t("builderImportExport.defaults.answer", { ord: j + 1 })).trim() ||
		t("builderImportExport.defaults.answer", { ord: j + 1 })).slice(0, 17);

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
	
	// Reguły eksportu:
	// - zamknięte sondaze (u nas: status="ready") eksportujemy zawsze jako "prepared"
	// - draft poll_points: fixed_points zawsze = 0
	// - draft poll_text: answers zawsze = []
	const dbType = safeType(game?.type);
	const dbStatus = String(game?.status || "").toLowerCase().trim();
	
	const isDraft = dbStatus === "draft";
	const isClosedPoll = dbStatus === "ready"; // zamknięte => ready (u Ciebie tak ustawiasz po imporcie) :contentReference[oaicite:3]{index=3}
	
	const exportType =
	  (isClosedPoll && (dbType === "poll_text" || dbType === "poll_points"))
	    ? "prepared"
	    : dbType;

	const { data: questions, error: qErr } = await sb()
		.from("questions")
		.select("id,ord,text,answers(ord,text,fixed_points)")
		.eq("game_id", gameId)
		.order("ord", { ascending: true });
	if (qErr) throw qErr;

	const qs = questions || [];

	const out = {
	  game: { name: game?.name ?? t("builderImportExport.defaults.gameName"), type: exportType },
	  questions: [],
	};

	const n = qs.length;
	if (typeof onProgress === "function") {
		onProgress({ step: t("builderImportExport.export.step"), i: 0, n, msg: "" });
	}

	for (let idx = 0; idx < qs.length; idx++) {
		const q = qs[idx];
		const answers = q.answers || [];

		let outAnswers = [];

		if (exportType === "prepared") {
			outAnswers = answers.map((a) => ({
				text: a.text,
				fixed_points: Number(a.fixed_points) || 0,
			}));
		} else if (exportType === "poll_points") {
			outAnswers = answers.map((a) => ({
				text: a.text,
				fixed_points: isDraft ? 0 : (Number(a.fixed_points) || 0),
			}));
		} else {
			// poll_text: w trybie draft nie eksportujemy odpowiedzi/punktów
			outAnswers = [];
		}

		out.questions.push({
			text: q.text,
			answers: outAnswers,
		});

		if (typeof onProgress === "function") {
			onProgress({
				step: t("builderImportExport.export.step"),
				i: idx + 1,
				n,
				msg: q?.text ? String(q.text).slice(0, 60) : "",
			});
		}
	}

	return out;
}

/* =========================================================
	 IMPORT GAME (definicja gry: games + questions + answers)
========================================================= */

export async function importGame(payload, ownerId, onProgress) {
	if (!payload?.game || !Array.isArray(payload.questions)) {
		throw new Error(t("builderImportExport.import.invalidFormat"));
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
	
	const qs = payload.questions || [];
	const n = qs.length;
	if (typeof onProgress === "function") {
		onProgress({ step: t("builderImportExport.import.step"), i: 0, n, msg: "" });
	}
	for (let qi = 0; qi < qs.length; qi++) {
		const srcQ = qs[qi] || {};
		const qText = safeQText(srcQ.text, qi);

		const { data: qRow, error: qInsErr } = await sb()
			.from("questions")
			.insert(
				{
					game_id: game.id,
					ord: qi + 1,
					text: qText,
				},
				{ defaultToNull: false }
			)
			.select("id")
			.single();
		if (qInsErr) throw qInsErr;

		const srcA = Array.isArray(srcQ.answers) ? srcQ.answers : [];
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
				step: t("builderImportExport.import.step"),
				i: qi + 1,
				n,
				msg: qText ? String(qText).slice(0, 60) : "",
			});
		}
	}

	return game.id;
}

/* =========================================================
	 DOWNLOAD JSON
========================================================= */

export function downloadJson(filename, obj) {
	const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
