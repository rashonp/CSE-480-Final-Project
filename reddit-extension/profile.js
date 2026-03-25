(() => {
  const app = document.getElementById("app");
  const PROFILE_ENTRIES_KEY = "profileEntries";
  const USER_REPORTED_TRIGGERS_KEY = "userReportedTriggers";
  const AROUSAL_PROMPT_THRESHOLD_KEY = "arousalPromptThreshold";
  const INSTALL_TOKEN_HASH_KEY = "installTokenHash";
  const DEFAULT_AROUSAL_PROMPT_THRESHOLD = 0.1;
  let suppressStorageReload = false;

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const sendMessage = (type, payload = {}) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || "backend-request-failed"));
          return;
        }

        resolve(response.data || {});
      });
    });

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
    entry?.id
      ? `id:${entry.id}`
      : [
          String(entry?.postId || ""),
          String(entry?.selectedEmotion || ""),
          String(entry?.savedAt || ""),
        ].join("::");

  const readLocalProfileData = () =>
    new Promise((resolve) => {
      chrome.storage.local.get(
        [
          PROFILE_ENTRIES_KEY,
          USER_REPORTED_TRIGGERS_KEY,
          AROUSAL_PROMPT_THRESHOLD_KEY,
          INSTALL_TOKEN_HASH_KEY,
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
          const tokenHash = String(result?.[INSTALL_TOKEN_HASH_KEY] || "").trim();
          resolve({ entries, triggers, threshold, tokenHash });
        },
      );
    });

  const syncLocalProfileData = ({ entries, triggers, threshold, tokenHash }) =>
    new Promise((resolve) => {
      suppressStorageReload = true;
      chrome.storage.local.set(
        {
          [PROFILE_ENTRIES_KEY]: Array.isArray(entries) ? entries : [],
          [USER_REPORTED_TRIGGERS_KEY]: String(triggers || "").trim(),
          [AROUSAL_PROMPT_THRESHOLD_KEY]: Number.isFinite(Number(threshold))
            ? Math.max(0, Math.min(1, Number(threshold)))
            : DEFAULT_AROUSAL_PROMPT_THRESHOLD,
          [INSTALL_TOKEN_HASH_KEY]: String(tokenHash || "").trim(),
        },
        () => {
          suppressStorageReload = false;
          resolve();
        },
      );
    });

  const render = (entries, triggers, threshold, tokenHash) => {
    const triggerSection = `
      <section class="trigger-box">
        <label class="label">User token hash</label>
        <div class="hint" style="margin-bottom:8px; word-break:break-all;">${escapeHtml(
          tokenHash || "Not available yet.",
        )}</div>
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
              <button type="button" class="delete-btn" data-entry-key="${escapeHtml(getEntryKey(entry))}" data-entry-id="${escapeHtml(entry.id || "")}">Delete</button>
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

  const load = async () => {
    try {
      const data = await sendMessage("reddit-emotion-load-profile-data");
      await syncLocalProfileData({
        entries: Array.isArray(data?.entries) ? data.entries : [],
        triggers: String(data?.triggers || "").trim(),
        threshold: Number(data?.threshold),
        tokenHash: String(data?.tokenHash || "").trim(),
      });
      render(
        Array.isArray(data?.entries) ? data.entries : [],
        String(data?.triggers || "").trim(),
        Number.isFinite(Number(data?.threshold))
          ? Math.max(0, Math.min(1, Number(data.threshold)))
          : DEFAULT_AROUSAL_PROMPT_THRESHOLD,
        String(data?.tokenHash || "").trim(),
      );
    } catch {
      const local = await readLocalProfileData();
      render(local.entries, local.triggers, local.threshold, local.tokenHash);
    }
  };

  const saveTriggers = async () => {
    const input = document.getElementById("trigger-input");
    if (!(input instanceof HTMLTextAreaElement)) return;

    const value = input.value.trim();
    await syncLocalProfileData({
      ...(await readLocalProfileData()),
      triggers: value,
    });

    try {
      await sendMessage("reddit-emotion-save-profile-settings", {
        user_reported_triggers: value,
      });
    } catch {}

    await load();
  };

  const updateThresholdPreview = () => {
    const input = document.getElementById("threshold-input");
    const label = document.getElementById("threshold-value");
    if (!(input instanceof HTMLInputElement) || !(label instanceof HTMLElement)) {
      return;
    }

    label.textContent = formatThreshold(Number(input.value) / 100);
  };

  const saveThreshold = async () => {
    const input = document.getElementById("threshold-input");
    if (!(input instanceof HTMLInputElement)) return;

    const value = Math.max(0, Math.min(1, Number(input.value) / 100));
    await syncLocalProfileData({
      ...(await readLocalProfileData()),
      threshold: value,
    });

    try {
      await sendMessage("reddit-emotion-save-profile-settings", {
        arousal_prompt_threshold: value,
      });
    } catch {}

    await load();
  };

  const deleteEntry = async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;

    const entryId = String(button.dataset.entryId || "").trim();
    if (entryId) {
      try {
        await sendMessage("reddit-emotion-delete-profile-entry", {
          entry_id: entryId,
        });
      } catch {}
    }

    const entryKey = button.dataset.entryKey || "";
    const local = await readLocalProfileData();
    const nextEntries = local.entries.filter((entry) => getEntryKey(entry) !== entryKey);
    await syncLocalProfileData({
      entries: nextEntries,
      triggers: local.triggers,
      threshold: local.threshold,
      tokenHash: local.tokenHash,
    });
    await load();
  };

  const clearAllData = async () => {
    try {
      await sendMessage("reddit-emotion-clear-profile-data");
    } catch {}

    suppressStorageReload = true;
    chrome.storage.local.get(["backendBaseUrl"], (result) => {
      const backendBaseUrl = String(result?.backendBaseUrl || "").trim();
      chrome.storage.local.clear(() => {
        if (!backendBaseUrl) {
          suppressStorageReload = false;
          void load();
          return;
        }

        chrome.storage.local.set({ backendBaseUrl }, async () => {
          suppressStorageReload = false;
          await load();
        });
      });
    });
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || suppressStorageReload) return;
    if (
      Object.prototype.hasOwnProperty.call(changes, PROFILE_ENTRIES_KEY) ||
      Object.prototype.hasOwnProperty.call(changes, USER_REPORTED_TRIGGERS_KEY) ||
      Object.prototype.hasOwnProperty.call(changes, AROUSAL_PROMPT_THRESHOLD_KEY) ||
      Object.prototype.hasOwnProperty.call(changes, INSTALL_TOKEN_HASH_KEY)
    ) {
      void load();
    }
  });

  void load();
})();
