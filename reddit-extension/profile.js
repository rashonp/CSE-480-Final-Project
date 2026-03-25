(() => {
  const app = document.getElementById("app");
  const PROFILE_ENTRIES_KEY = "profileEntries";
  const USER_REPORTED_TRIGGERS_KEY = "userReportedTriggers";

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const formatTime = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return "";
    }
  };

  const formatPercent = (value) =>
    typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a";

  const render = (entries, triggers) => {
    const triggerSection = `
      <section class="trigger-box">
        <label class="label" for="trigger-input">Emotionally triggering topics</label>
        <textarea id="trigger-input" placeholder="Examples: family conflict, betrayal, being dismissed, financial control...">${escapeHtml(
          triggers,
        )}</textarea>
        <div class="trigger-actions">
          <span class="hint">Used for personalized arousal scoring when this is not blank.</span>
          <button type="button" id="save-trigger-btn">Save triggers</button>
        </div>
      </section>
    `;

    if (!entries.length) {
      app.innerHTML =
        `${triggerSection}<div class="empty">No saved reflections yet. Label a post and continue or skip from the check-in modal.</div>`;
      document
        .getElementById("save-trigger-btn")
        ?.addEventListener("click", saveTriggers);
      return;
    }

    app.innerHTML = `${triggerSection}<div class="list">${entries
      .map(
        (entry) => `
          <article class="card">
            <div class="row">
              <span class="emotion">${escapeHtml(entry.selectedEmotion)}</span>
              <span class="time">${formatTime(entry.savedAt)}</span>
            </div>
            <p class="summary">${escapeHtml(entry.summary)}</p>
            <div class="meta"><strong>Final:</strong> ${formatPercent(entry.arousalScore)}</div>
            <div class="meta"><strong>LLM Generic:</strong> ${formatPercent(entry.genericArousalScore)}</div>
            <div class="meta"><strong>LLM Personalized:</strong> ${formatPercent(entry.personalizedArousalScore)}</div>
            <a href="${escapeHtml(entry.postId)}" target="_blank" rel="noreferrer">Open post</a>
          </article>
        `,
      )
      .join("")}</div>`;
    document
      .getElementById("save-trigger-btn")
      ?.addEventListener("click", saveTriggers);
  };

  const load = () => {
    chrome.storage.local.get(
      [PROFILE_ENTRIES_KEY, USER_REPORTED_TRIGGERS_KEY],
      (result) => {
        const entries = Array.isArray(result?.[PROFILE_ENTRIES_KEY])
          ? result[PROFILE_ENTRIES_KEY]
          : [];
        const triggers = String(result?.[USER_REPORTED_TRIGGERS_KEY] || "").trim();
        render(entries, triggers);
      },
    );
  };

  const saveTriggers = () => {
    const input = document.getElementById("trigger-input");
    if (!(input instanceof HTMLTextAreaElement)) return;

    chrome.storage.local.set(
      {
        [USER_REPORTED_TRIGGERS_KEY]: input.value.trim(),
      },
      () => load(),
    );
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (
      Object.prototype.hasOwnProperty.call(changes, PROFILE_ENTRIES_KEY) ||
      Object.prototype.hasOwnProperty.call(changes, USER_REPORTED_TRIGGERS_KEY)
    ) {
      load();
    }
  });

  load();
})();
