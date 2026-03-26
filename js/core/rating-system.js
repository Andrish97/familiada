// js/core/rating-system.js
import { sb } from "./supabase.js";
import { getUser } from "./auth.js";
import { t } from "../../translation/translation.js";

const RATING_LS_KEY = "fam:app_rated";

export async function initRatingSystem() {
    const user = await getUser();
    if (!user || user.is_guest) return;

    // Check if already rated (local storage optimization)
    if (localStorage.getItem(RATING_LS_KEY)) return;

    // Check 7 days activity
    const createdAt = new Date(user.created_at);
    const now = new Date();
    const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);
    if (diffDays < 7) return;

    // Check Supabase if already rated
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

    // Show modal
    showRatingModal(user.id);
}

function showRatingModal(userId) {
    const overlay = document.createElement("div");
    overlay.className = "overlay rating-overlay";
    overlay.id = "ratingOverlay";
    
    overlay.innerHTML = `
        <div class="modal rating-modal">
            <div class="mTitle">${t("rating.modal.title")}</div>
            <div class="mSub">${t("rating.modal.sub")}</div>
            
            <div class="stars-row" id="starsRow">
                <button class="star-btn" data-value="1">★</button>
                <button class="star-btn" data-value="2">★</button>
                <button class="star-btn" data-value="3">★</button>
                <button class="star-btn" data-value="4">★</button>
                <button class="star-btn" data-value="5">★</button>
            </div>
            
            <textarea class="inp rating-comment" id="ratingComment" rows="3" placeholder="${t("rating.modal.commentPlaceholder")}"></textarea>
            
            <div class="modal-actions">
                <button class="btn sm" id="btnRatingLater">${t("rating.modal.later")}</button>
                <button class="btn sm gold" id="btnRatingSend" disabled>${t("rating.modal.send")}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    let selectedStars = 0;
    const stars = overlay.querySelectorAll(".star-btn");
    const sendBtn = overlay.getElementById("btnRatingSend");
    const laterBtn = overlay.getElementById("btnRatingLater");

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
            alert(t("rating.modal.error"));
            sendBtn.disabled = false;
        } else {
            localStorage.setItem(RATING_LS_KEY, "true");
            overlay.innerHTML = `
                <div class="modal rating-modal">
                    <div class="mTitle">${t("rating.modal.thanksTitle")}</div>
                    <div class="mSub">${t("rating.modal.thanksSub")}</div>
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
