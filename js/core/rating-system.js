// js/core/rating-system.js
import { sb } from "./supabase.js?v=v2026-04-24T16285";
import { getUser } from "./auth.js?v=v2026-04-24T16285";
import { t } from "../../translation/translation.js?v=v2026-04-24T16285";

const RATING_LS_KEY = "fam:app_rated";
const RATING_DISMISSED_KEY = "fam:app_rating_dismissed_at";
const RATING_SUPPRESSED_KEY = "fam:app_rating_suppressed";

export async function initRatingSystem() {
    const user = await getUser();
    if (!user || user.is_guest) return;

    // 1. Jeśli już ocenił (LS lub DB sprawdzane później) - nie pokazuj
    if (localStorage.getItem(RATING_LS_KEY)) return;

    // 2. Jeśli użytkownik kliknął "Nie pytaj więcej" - nie pokazuj
    if (localStorage.getItem(RATING_SUPPRESSED_KEY)) return;

    // 3. Sprawdź 7 dni od rejestracji
    const createdAt = new Date(user.created_at);
    const now = new Date();
    const diffFromCreation = (now - createdAt) / (1000 * 60 * 60 * 24);
    if (diffFromCreation < 7) return;

    // 4. Sprawdź czy modal był niedawno zamknięty (ponowne przypomnienie po 7 dniach)
    const dismissedAt = localStorage.getItem(RATING_DISMISSED_KEY);
    if (dismissedAt) {
        const lastDismissed = new Date(parseInt(dismissedAt));
        const diffFromDismissal = (now - lastDismissed) / (1000 * 60 * 60 * 24);
        if (diffFromDismissal < 7) return;
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
        localStorage.setItem(RATING_LS_KEY, "true");
        return;
    }

    // Pokaż modal
    showRatingModal(user.id);
}

function showRatingModal(userId) {
    const overlay = document.createElement("div");
    overlay.className = "overlay rating-overlay";
    overlay.id = "ratingOverlay";
    
    overlay.innerHTML = `
        <div class="modal rating-modal">
            <div class="mTitle">${t("common.rating.modal.title")}</div>
            <div class="mSub">${t("common.rating.modal.sub")}</div>

            <div class="stars-row" id="starsRow">
                <button class="star-btn" data-value="1">★</button>
                <button class="star-btn" data-value="2">★</button>
                <button class="star-btn" data-value="3">★</button>
                <button class="star-btn" data-value="4">★</button>
                <button class="star-btn" data-value="5">★</button>
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

    laterBtn.addEventListener("click", () => {
        // Zapisz datę odrzucenia - wróci za 7 dni
        localStorage.setItem(RATING_DISMISSED_KEY, Date.now().toString());
        overlay.remove();
    });

    neverBtn.addEventListener("click", () => {
        // Zablokuj na stałe
        localStorage.setItem(RATING_SUPPRESSED_KEY, "true");
        overlay.remove();
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
            alert(t("common.rating.modal.error"));
            sendBtn.disabled = false;
        } else {
            localStorage.setItem(RATING_LS_KEY, "true");
            overlay.innerHTML = `
                <div class="modal rating-modal">
                    <div class="mTitle">${t("common.rating.modal.thanksTitle")}</div>
                    <div class="mSub">${t("common.rating.modal.thanksSub")}</div>
                    <div class="modal-actions">
                        <button class="btn sm gold" id="btnRatingClose">${t("common.done")}</button>
                    </div>
                </div>
            `;
            overlay.querySelector("#btnRatingClose").onclick = () => overlay.remove();
        }
    });
}

function highlightStars(count, stars) {
    stars.forEach(s => {
        s.classList.toggle("active", parseInt(s.dataset.value) <= count);
    });
}
