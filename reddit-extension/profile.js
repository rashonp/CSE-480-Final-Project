(() => {
  const app = document.getElementById("app");
  const PROFILE_ENTRIES_KEY = "profileEntries";
  const USER_REPORTED_TRIGGERS_KEY = "userReportedTriggers";
  const AROUSAL_PROMPT_THRESHOLD_KEY = "arousalPromptThreshold";
  const DEFAULT_AROUSAL_PROMPT_THRESHOLD = 0.1;

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

  const formatThreshold = (value) => `${Math.round(value * 100)}%`;

  const getEntryKey = (entry) =>
    [
      String(entry?.postId || ""),
      String(entry?.selectedEmotion || ""),
      String(entry?.savedAt || ""),
    ].join("::");

  const render = (entries, triggers, threshold) => {
    const triggerSection = `
      <section class="trigger-box">
        <label class="label" for="trigger-input">Emotionally triggering topics</label>
        <textarea id="trigger-input" placeholder="Examples: family conflict, betrayal, being dismissed, financial control...">${escapeHtml(
          triggers,
        )}</textarea>
        <div class="trigger-actions">
          <span class="hint">Used for personalized Emotional Trigger Score calculations when this is not blank.</span>
          <div>
            <button type="button" id="save-trigger-btn">Save triggers</button>
            <button type="button" id="clear-all-data-btn" class="danger-btn">Clear all data</button>
          </div>
        </div>
      </section>
    `;

    const thresholdSection = `
      <section class="trigger-box setting-box">
        <label class="label" for="threshold-input">Emotional Trigger Score threshold for popup</label>
        <input id="threshold-input" type="range" min="0" max="100" step="1" value="${Math.round(
          threshold * 100,
        )}" />
        <p class="setting-value" id="threshold-value">${formatThreshold(
          threshold,
        )}</p>
        <div class="trigger-actions">
          <span class="hint">The emotional labeling popup appears only when a post's Emotional Trigger Score is above this threshold.</span>
          <button type="button" id="save-threshold-btn">Save threshold</button>
        </div>
      </section>
    `;

    if (!entries.length) {
      app.innerHTML =
        `${triggerSection}${thresholdSection}<div class="empty">No saved reflections yet. Label a post and continue or skip from the check-in modal.</div>`;
      document
        .getElementById("save-trigger-btn")
        ?.addEventListener("click", saveTriggers);
      document
        .getElementById("save-threshold-btn")
        ?.addEventListener("click", saveThreshold);
      document
        .getElementById("threshold-input")
        ?.addEventListener("input", updateThresholdPreview);
      document
        .getElementById("clear-all-data-btn")
        ?.addEventListener("click", clearAllData);
      return;
    }

    app.innerHTML = `${triggerSection}${thresholdSection}<div class="list">${entries
      .map(
        (entry) => `
          <article class="card">
            <div class="row">
              <span class="emotion">${escapeHtml(entry.selectedEmotion)}</span>
              <span class="time">${formatTime(entry.savedAt)}</span>
            </div>
            <p class="summary">${escapeHtml(entry.summary)}</p>
            <div class="meta"><strong>Trigger amount:</strong> ${
              typeof entry.triggerIntensity === "number"
                ? `${entry.triggerIntensity}/5`
                : "n/a"
            }</div>
            <div class="meta"><strong>Emotional Trigger Score:</strong> ${formatPercent(entry.arousalScore)}</div>
            <div class="meta"><strong>LLM Generic:</strong> ${formatPercent(entry.genericArousalScore)}</div>
            <div class="meta"><strong>LLM Personalized:</strong> ${formatPercent(entry.personalizedArousalScore)}</div>
            <div class="card-actions">
              <a href="${escapeHtml(entry.postId)}" target="_blank" rel="noreferrer">Open post</a>
              <button type="button" class="delete-btn" data-entry-key="${escapeHtml(getEntryKey(entry))}">Delete</button>
            </div>
          </article>
        `,
      )
      .join("")}</div>`;
    document
      .getElementById("save-trigger-btn")
      ?.addEventListener("click", saveTriggers);
    document
      .getElementById("save-threshold-btn")
      ?.addEventListener("click", saveThreshold);
    document
      .getElementById("threshold-input")
      ?.addEventListener("input", updateThresholdPreview);
    document
      .getElementById("clear-all-data-btn")
      ?.addEventListener("click", clearAllData);
    document.querySelectorAll(".delete-btn").forEach((button) => {
      button.addEventListener("click", deleteEntry);
    });
  };

  const load = () => {
    chrome.storage.local.get(
      [
        PROFILE_ENTRIES_KEY,
        USER_REPORTED_TRIGGERS_KEY,
        AROUSAL_PROMPT_THRESHOLD_KEY,
      ],
      (result) => {
        const entries = Array.isArray(result?.[PROFILE_ENTRIES_KEY])
          ? result[PROFILE_ENTRIES_KEY]
          : [];
        const triggers = String(result?.[USER_REPORTED_TRIGGERS_KEY] || "").trim();
        const rawThreshold = Number(result?.[AROUSAL_PROMPT_THRESHOLD_KEY]);
        const threshold = Number.isFinite(rawThreshold)
          ? Math.max(0, Math.min(1, rawThreshold))
          : DEFAULT_AROUSAL_PROMPT_THRESHOLD;
        render(entries, triggers, threshold);
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

  const updateThresholdPreview = () => {
    const input = document.getElementById("threshold-input");
    const label = document.getElementById("threshold-value");
    if (!(input instanceof HTMLInputElement) || !(label instanceof HTMLElement)) {
      return;
    }

    label.textContent = formatThreshold(Number(input.value) / 100);
  };

  const saveThreshold = () => {
    const input = document.getElementById("threshold-input");
    if (!(input instanceof HTMLInputElement)) return;

    const value = Math.max(0, Math.min(1, Number(input.value) / 100));
    chrome.storage.local.set(
      {
        [AROUSAL_PROMPT_THRESHOLD_KEY]: value,
      },
      () => load(),
    );
  };

  const deleteEntry = (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;

    const entryKey = button.dataset.entryKey || "";
    chrome.storage.local.get([PROFILE_ENTRIES_KEY], (result) => {
      const entries = Array.isArray(result?.[PROFILE_ENTRIES_KEY])
        ? result[PROFILE_ENTRIES_KEY]
        : [];
      const nextEntries = entries.filter((entry) => getEntryKey(entry) !== entryKey);
      chrome.storage.local.set({ [PROFILE_ENTRIES_KEY]: nextEntries }, () => load());
    });
  };

  const clearAllData = () => {
    chrome.storage.local.clear(() => load());
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (
      Object.prototype.hasOwnProperty.call(changes, PROFILE_ENTRIES_KEY) ||
      Object.prototype.hasOwnProperty.call(changes, USER_REPORTED_TRIGGERS_KEY) ||
      Object.prototype.hasOwnProperty.call(changes, AROUSAL_PROMPT_THRESHOLD_KEY)
    ) {
      load();
    }
  });

  load();
})();
