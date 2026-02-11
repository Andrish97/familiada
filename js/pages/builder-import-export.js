// js/pages/builder-import-export.js
import { sb } from "../core/supabase.js";
import { t } from "../../translation/translation.js";

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

function makeVoterToken() {
	return (
		(globalThis.crypto?.randomUUID?.() || null) ??
		`${Date.now()}_${Math.random().toString(16).slice(2)}`
	);
}

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
		.select("id,ord,text")
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

		const { data: answers, error: aErr } = await sb()
			.from("answers")
			.select("ord,text,fixed_points")
			.eq("question_id", q.id)
			.order("ord", { ascending: true });
		if (aErr) throw aErr;

		let outAnswers = [];

		if (exportType === "prepared") {
			outAnswers = (answers || []).map((a) => ({
				text: a.text,
				fixed_points: Number(a.fixed_points) || 0,
			}));
		} else if (exportType === "poll_points") {
			outAnswers = (answers || []).map((a) => ({
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
		    step: "Import: zapis pytań…",
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

/* =========================================================
	 POLL IMPORT FROM URL (OPEN/CLOSED) + demo votes seeding
========================================================= */

async function fetchJsonFromUrl(url) {
	const u = String(url || "").trim();
	if (!u) throw new Error("Brak URL do JSON.");

	const ok =
		/^https?:\/\//i.test(u) ||
		u.startsWith("../") ||
		u.startsWith("./") ||
		u.startsWith("/");

	if (!ok) throw new Error("Podaj link http(s) albo ścieżkę względną do JSON.");

	const res = await fetch(u, { cache: "no-store" });
	if (!res.ok) throw new Error(`Nie udało się pobrać JSON (HTTP ${res.status}).`);

	const txt = await res.text();
	try {
		return JSON.parse(txt);
	} catch {
		throw new Error("Błędny JSON (nie da się sparsować).");
	}
}

async function currentUserId() {
	const { data, error } = await sb().auth.getUser();
	if (error) throw error;
	const uid = data?.user?.id;
	if (!uid) throw new Error("Brak zalogowanego użytkownika.");
	return uid;
}

function hardType(v) {
	const t = String(v || "").trim();
	if (t === "poll_text" || t === "poll_points") return t;
	throw new Error("JSON: game.type musi być 'poll_text' albo 'poll_points'.");
}

function hardStatus(v) {
	const s = String(v || "").toLowerCase().trim();
	if (s === "open" || s === "closed") return s;
	return "open";
}

function normText(s) {
	return String(s ?? "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");
}

async function setGameStatus(gameId, status) {
	const { error } = await sb().from("games").update({ status }).eq("id", gameId);
	if (error) throw error;
}

async function listQuestions(gameId) {
	const { data, error } = await sb()
		.from("questions")
		.select("id,ord")
		.eq("game_id", gameId)
		.order("ord", { ascending: true });

	if (error) throw error;
	return data || [];
}

async function listAnswersForQuestions(qIds) {
	if (!qIds?.length) return new Map();

	const { data, error } = await sb()
		.from("answers")
		.select("id,question_id,ord")
		.in("question_id", qIds)
		.order("ord", { ascending: true });

	if (error) throw error;

	const map = new Map();
	for (const r of data || []) {
		if (!map.has(r.question_id)) map.set(r.question_id, []);
		map.get(r.question_id).push(r);
	}
	return map;
}

async function createPollSessionsForAllQuestions(gameId, qs) {
	if (!qs?.length) return new Map();

	const rows = qs.map((q) => ({
		game_id: gameId,
		question_id: q.id,
		question_ord: Number(q.ord) || 1,
		is_open: true,
	}));

	const { data, error } = await sb()
		.from("poll_sessions")
		.insert(rows, { defaultToNull: false })
		.select("id,question_id,question_ord");
	if (error) throw error;

	const map = new Map(); // question_id -> session row
	for (const s of data || []) map.set(s.question_id, s);
	return map;
}

async function seedPollTextEntries({ gameId, qs, sessByQ, votes }) {
	const rows = [];

	for (const v of votes) {
		const arr = Array.isArray(v?.answers_raw) ? v.answers_raw : [];
		const voter = makeVoterToken();

		for (let i = 0; i < qs.length; i++) {
			const raw = String(arr[i] ?? "").trim().slice(0, 80);
			if (!raw) continue;

			const q = qs[i];
			const sess = sessByQ.get(q.id);
			if (!sess?.id) {
				throw new Error("DEMO: brak poll_session dla pytania (nie da się seedować wpisów).");
			}

			rows.push({
				game_id: gameId,
				poll_session_id: sess.id,
				question_id: q.id,
				voter_token: voter,
				answer_raw: raw,
				answer_norm: normText(raw),
			});
		}
	}

	if (!rows.length) return;

	const CHUNK = 500;
	for (let i = 0; i < rows.length; i += CHUNK) {
		const part = rows.slice(i, i + CHUNK);
		const { error } = await sb().from("poll_text_entries").insert(part, { defaultToNull: false });
		if (error) throw error;
	}
}

async function seedPollPointsVotes({ gameId, qs, sessByQ, votes }) {
	const qIds = qs.map((q) => q.id);
	const aMap = await listAnswersForQuestions(qIds);

	const rows = [];

	for (const v of votes) {
		const picks = Array.isArray(v?.picks) ? v.picks : [];
		const voter = makeVoterToken();

		for (let i = 0; i < qs.length; i++) {
			const idx = Number(picks[i]);
			if (!Number.isFinite(idx)) continue;

			const q = qs[i];
			const answers = aMap.get(q.id) || [];
			const a = answers[idx];
			if (!a) continue;

			const sess = sessByQ.get(q.id);
			if (!sess?.id) {
				throw new Error("DEMO: brak poll_session dla pytania (poll_votes nie da się seedować).");
			}

			rows.push({
				game_id: gameId,
				question_ord: Number(q.ord) || (i + 1),
				answer_ord: Number(a.ord) || (idx + 1),
				voter_token: voter,
				poll_session_id: sess.id,
				question_id: q.id,
				answer_id: a.id,
			});
		}
	}

	if (!rows.length) return;

	const CHUNK = 500;
	for (let i = 0; i < rows.length; i += CHUNK) {
		const part = rows.slice(i, i + CHUNK);
		const { error } = await sb().from("poll_votes").insert(part, { defaultToNull: false });
		if (error) throw error;
	}
}

async function importPollFromUrlInternal(url, ownerId) {
	const src = await fetchJsonFromUrl(url);

	if (!src?.game || !Array.isArray(src?.questions)) {
		throw new Error("JSON: brak game / questions.");
	}

	const type = hardType(src.game.type);
	const pollStatus = hardStatus(src.game.status);
	const name = String(src.game.name ?? "DEMO").trim() || "DEMO";

	/* ===============================
		 1) payload pod importGame
	=============================== */
	const payload = { game: { name, type }, questions: [] };

	if (type === "poll_text") {
		if (pollStatus === "closed") {
			payload.questions = src.questions.map((q) => ({
				text: String(q?.text ?? ""),
				answers: (Array.isArray(q?.answers) ? q.answers : []).map((a) => ({
					text: String(a?.text ?? ""),
					fixed_points: safePts(a?.fixed_points),
				})),
			}));
		} else {
			payload.questions = src.questions.map((q) => ({
				text: String(q?.text ?? ""),
				answers: [],
			}));
		}
	} else {
		// poll_points
		if (pollStatus === "closed") {
			payload.questions = src.questions.map((q) => ({
				text: String(q?.text ?? ""),
				answers: (Array.isArray(q?.answers) ? q.answers : []).map((a) => ({
					text: String(a?.text ?? ""),
					fixed_points: safePts(a?.fixed_points),
				})),
			}));
		} else {
			payload.questions = src.questions.map((q) => ({
				text: String(q?.text ?? ""),
				answers: (Array.isArray(q?.answers) ? q.answers : []).map((a) => ({
					text: String(a?.text ?? ""),
					fixed_points: 0,
				})),
			}));
		}
	}

	/* ===============================
		 2) import definicji gry
	=============================== */
	const gameId = await importGame(payload, ownerId);

	/* ===============================
		 3) CLOSED -> status READY i koniec
	=============================== */
	if (pollStatus === "closed") {
		await setGameStatus(gameId, "ready");
		return gameId;
	}

	/* ===============================
		 4) OPEN -> sesje + status poll_open
	=============================== */
	const qs = await listQuestions(gameId);
	if (!qs.length) throw new Error("DEMO: gra nie ma pytań (nie da się otworzyć sondażu).");

	const sessByQ = await createPollSessionsForAllQuestions(gameId, qs);
	await setGameStatus(gameId, "poll_open");

	/* ===============================
		 5) seed głosów (jeśli są)
	=============================== */
	const votes = Array.isArray(src.votes) ? src.votes : [];
	if (!votes.length) return gameId;

	if (type === "poll_text") {
		await seedPollTextEntries({ gameId, qs, sessByQ, votes });
	} else {
		await seedPollPointsVotes({ gameId, qs, sessByQ, votes });
	}

	return gameId;
}

export async function importPollFromUrl(url) {
	const ownerId = await currentUserId();
	return await importPollFromUrlInternal(url, ownerId);
}
