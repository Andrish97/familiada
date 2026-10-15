// js/core/rating-system.js
import { sb } from "./supabase.js?v=v2026-10-15T15590";
import { t } from "../../translation/translation.js?v=v2026-10-15T15590";
import { alertModal } from "./modal.js?v=v2026-10-15T15590";
import { icon } from "./icons.js?v=v2026-10-15T15590";

const RATING_LS_PREFIX = "fam:app_rated:";
const RATING_DISMISSED_PREFIX = "fam:app_rating_dismissed_at:";
const RATING_SUPPRESSED_PREFIX = "fam:app_rating_suppressed:";
const LEGACY_DISMISSED_KEY = "fam:app_rating_dismissed_at";
const LEGACY_SUPPRESSED_KEY = "fam:app_rating_suppressed";
let activePrompt = null;

function readStorage(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Storage can be disabled. */ }
}

export async function initRatingSystem(user) {
    if (!user || user.is_guest) return;
    if (activePrompt) return activePrompt;
    activePrompt = showRatingIfEligible(user).finally(() => { activePrompt = null; });
    return activePrompt;
}

async function showRatingIfEligible(user) {
    const ratedKey = `${RATING_LS_PREFIX}${user.id}`;
    const dismissedKey = `${RATING_DISMISSED_PREFIX}${user.id}`;
    const suppressedKey = `${RATING_SUPPRESSED_PREFIX}${user.id}`;

    // 1. Jeśli już ocenił (LS lub DB sprawdzane później) - nie pokazuj
    if (readStorage(ratedKey)) return;

    // 2. Jeśli użytkownik kliknął "Nie pytaj więcej" - nie pokazuj
    if (readStorage(suppressedKey) || readStorage(LEGACY_SUPPRESSED_KEY)) {
        writeStorage(suppressedKey, "true");
        return;
    }

    // 3. Sprawdź 7 dni od rejestracji
    const createdAtMs = Date.parse(user.created_at || "");
    if (!Number.isFinite(createdAtMs)) return;
    const now = new Date();
    const diffFromCreation = (now.getTime() - createdAtMs) / (1000 * 60 * 60 * 24);
    if (diffFromCreation < 7) return;

    // 4. Sprawdź czy modal był niedawno zamknięty (ponowne przypomnienie po 7 dniach)
    const dismissedAt = readStorage(dismissedKey) || readStorage(LEGACY_DISMISSED_KEY);
    if (dismissedAt) {
        const lastDismissed = new Date(parseInt(dismissedAt));
        const diffFromDismissal = (now - lastDismissed) / (1000 * 60 * 60 * 24);
        if (diffFromDismissal < 7) return;
        writeStorage(dismissedKey, dismissedAt);
    }

    // 5. Sprawdź w Supabase (na wypadek wyczyszczonego LS)
    const { data: existingRating, error } = await sb()
        .from("app_ratings")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {
        console.error("[rating] Error checking existing rating:", error);
        return;
    }

    if (existingRating) {
        writeStorage(ratedKey, "true");
        return;
    }

    // Pokaż modal
    await showRatingModal(user.id, { ratedKey, dismissedKey, suppressedKey });
}

function showRatingModal(userId, storageKeys) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "overlay rating-overlay";
    overlay.id = "ratingOverlay";
    
    overlay.innerHTML = `
        <div class="modal rating-modal">
            <div class="mHead">
                <div class="mTitle">${t("common.rating.modal.title")}</div>
                <button class="btn sm" id="btnRatingX" type="button" aria-label="${t("common.modal.closeLabel")}">${icon("close")}</button>
            </div>
            <div class="mSub">${t("common.rating.modal.sub")}</div>

            <div class="stars-row" id="starsRow">
                <button class="star-btn" data-value="1" aria-label="1/5">${icon("star")}</button>
                <button class="star-btn" data-value="2" aria-label="2/5">${icon("star")}</button>
                <button class="star-btn" data-value="3" aria-label="3/5">${icon("star")}</button>
                <button class="star-btn" data-value="4" aria-label="4/5">${icon("star")}</button>
                <button class="star-btn" data-value="5" aria-label="5/5">${icon("star")}</button>
            </div>

            <textarea class="inp rating-comment" id="ratingComment" rows="3" placeholder="${t("common.rating.modal.commentPlaceholder")}"></textarea>

            <div class="modal-actions-v">
                <button class="btn sm gold full" id="btnRatingSend" disabled>${t("common.rating.modal.send")}</button>
                <div class="modal-actions-row">
                    <button class="btn sm" id="btnRatingLater">${t("common.rating.modal.later")}</button>
                    <button class="btn sm danger" id="btnRatingNever">${t("common.rating.modal.never")}</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    let selectedStars = 0;
    const stars = overlay.querySelectorAll(".star-btn");
    const sendBtn = overlay.querySelector("#btnRatingSend");
    const laterBtn = overlay.querySelector("#btnRatingLater");
    const neverBtn = overlay.querySelector("#btnRatingNever");

    stars.forEach(btn => {
        btn.addEventListener("mouseenter", () => highlightStars(btn.dataset.value, stars));
        btn.addEventListener("mouseleave", () => highlightStars(selectedStars, stars));
        btn.addEventListener("click", () => {
            selectedStars = parseInt(btn.dataset.value);
            highlightStars(selectedStars, stars);
            sendBtn.disabled = false;
        });
    });

    // X działa jak "Później" — zamknięcie bez oceny wraca za 7 dni.
    let finished = false;
    const finish = (value) => {
        if (finished) return;
        finished = true;
        overlay.remove();
        resolve(value);
    };
    const dismissLater = () => {
        // Zapisz datę odrzucenia - wróci za 7 dni
        writeStorage(storageKeys.dismissedKey, Date.now().toString());
        finish("later");
    };
    laterBtn.addEventListener("click", dismissLater);
    overlay.querySelector("#btnRatingX").addEventListener("click", dismissLater);

    neverBtn.addEventListener("click", () => {
        // Zablokuj na stałe
        writeStorage(storageKeys.suppressedKey, "true");
        finish("never");
    });

    sendBtn.addEventListener("click", async () => {
        const comment = overlay.querySelector("#ratingComment").value.trim();
        sendBtn.disabled = true;
        
        const { error } = await sb().from("app_ratings").insert({
            user_id: userId,
            stars: selectedStars,
            comment: comment || null
        });

        if (error) {
            console.error("[rating] Error saving rating:", error);
            alertModal({ text: t("common.rating.modal.error") });
            sendBtn.disabled = false;
        } else {
            writeStorage(storageKeys.ratedKey, "true");
            overlay.innerHTML = `
                <div class="modal rating-modal">
                    <div class="mHead">
                        <div class="mTitle">${t("common.rating.modal.thanksTitle")}</div>
                        <button class="btn sm" id="btnRatingThanksX" type="button" aria-label="${t("common.modal.closeLabel")}">${icon("close")}</button>
                    </div>
                    <div class="mSub">${t("common.rating.modal.thanksSub")}</div>
                    <div class="modal-actions">
                        <button class="btn sm gold" id="btnRatingClose">${t("common.done")}</button>
                    </div>
                </div>
            `;
            overlay.querySelector("#btnRatingClose").onclick = () => finish("rated");
            overlay.querySelector("#btnRatingThanksX").onclick = () => finish("rated");
        }
    });
  });
}

function highlightStars(count, stars) {
    stars.forEach(s => {
        s.classList.toggle("active", parseInt(s.dataset.value) <= count);
    });
}
