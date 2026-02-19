console.log("Emotion extension v3 loaded");

const scoreCache = new Map();
const arousalCache = new Map();
const commentSignalCache = new Map();
const persistentLowScoreCache = new Map();
let classifierPromise = null;
let classifierUnavailable = false;
let lowScoreCacheLoadPromise = null;
let arousalDialogState = null;

const MAX_TEXT_LENGTH = 2000;
const LOW_SCORE_CACHE_KEY = "lowScoreConcentrationCache";
const LOW_SCORE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const LOW_SCORE_CACHE_MAX_ENTRIES = 500;
const EMOTIONS = [
  { key: "happy", label: "Happy" },
  { key: "angry", label: "Angry" },
  { key: "sad", label: "Sad" },
  { key: "surprised", label: "Surprised" },
  { key: "love", label: "Love" },
];

function saveEmotion(postId, emotion) {
  chrome.storage.local.get(["emotionTags"], (result) => {
    const tags = result.emotionTags || {};
    tags[postId] = emotion;
    chrome.storage.local.set({ emotionTags: tags });
  });
}

function loadEmotion(postId, callback) {
  chrome.storage.local.get(["emotionTags"], (result) => {
    const tags = result.emotionTags || {};
    callback(tags[postId]);
  });
}

function loadEmotionAsync(postId) {
  return new Promise((resolve) => {
    loadEmotion(postId, (value) => resolve(value || null));
  });
}

function stopBubble(event) {
  event.stopPropagation();
}

function blockNavigation(event) {
  event.preventDefault();
  event.stopPropagation();
}

function closeArousalDialog(result) {
  if (!arousalDialogState) return;

  const { overlay, input, resolver } = arousalDialogState;
  if (typeof resolver === "function") {
    resolver({
      ...result,
      selectedEmotion: arousalDialogState.selectedEmotion,
    });
  }

  overlay.classList.remove("visible");
  input.value = "";
  arousalDialogState.selectedEmotion = null;
  arousalDialogState.emotionButtons.forEach((btn) =>
    btn.classList.remove("active"),
  );
  arousalDialogState.resolver = null;
}

function ensureArousalDialog() {
  if (arousalDialogState) return arousalDialogState;

  const overlay = document.createElement("div");
  overlay.className = "reddit-arousal-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "reddit-arousal-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  const title = document.createElement("h3");
  title.className = "reddit-arousal-modal-title";
  title.textContent = "High Arousal Warning";

  const message = document.createElement("p");
  message.className = "reddit-arousal-modal-message";

  const emotionLabel = document.createElement("label");
  emotionLabel.className = "reddit-arousal-modal-label";
  emotionLabel.textContent = "Select emotion";

  const emotionPicker = document.createElement("div");
  emotionPicker.className = "reddit-arousal-modal-emotion-picker";

  const emotionButtons = [];
  EMOTIONS.forEach((emotion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reddit-arousal-modal-emotion-btn";
    button.textContent = emotion.label;
    button.dataset.emotionKey = emotion.key;

    button.addEventListener("click", () => {
      const nextValue =
        arousalDialogState.selectedEmotion === emotion.key ? null : emotion.key;

      arousalDialogState.selectedEmotion = nextValue;
      emotionButtons.forEach((btn) => {
        const isActive = btn.dataset.emotionKey === nextValue;
        btn.classList.toggle("active", isActive);
      });
    });

    emotionButtons.push(button);
    emotionPicker.appendChild(button);
  });

  const inputLabel = document.createElement("label");
  inputLabel.className = "reddit-arousal-modal-label";
  inputLabel.textContent = "Optional note";

  const input = document.createElement("textarea");
  input.className = "reddit-arousal-modal-input";
  input.rows = 3;
  input.placeholder = "Enter any notes before continuing...";

  const actions = document.createElement("div");
  actions.className = "reddit-arousal-modal-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "reddit-arousal-modal-btn secondary";
  cancelBtn.textContent = "Cancel";

  const continueBtn = document.createElement("button");
  continueBtn.type = "button";
  continueBtn.className = "reddit-arousal-modal-btn primary";
  continueBtn.textContent = "Continue";

  actions.appendChild(cancelBtn);
  actions.appendChild(continueBtn);
  modal.appendChild(title);
  modal.appendChild(message);
  modal.appendChild(emotionLabel);
  modal.appendChild(emotionPicker);
  modal.appendChild(inputLabel);
  modal.appendChild(input);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeArousalDialog({ proceed: false, text: input.value });
    }
  });

  cancelBtn.addEventListener("click", () => {
    closeArousalDialog({ proceed: false, text: input.value });
  });

  continueBtn.addEventListener("click", () => {
    closeArousalDialog({ proceed: true, text: input.value });
  });

  document.addEventListener("keydown", (event) => {
    if (!arousalDialogState?.resolver) return;
    if (event.key !== "Escape") return;

    event.preventDefault();
    closeArousalDialog({
      proceed: false,
      text: arousalDialogState.input.value,
    });
  });

  arousalDialogState = {
    overlay,
    message,
    input,
    emotionButtons,
    selectedEmotion: null,
    resolver: null,
  };

  return arousalDialogState;
}

function showArousalDialog(percent, preselectedEmotion = null) {
  const dialog = ensureArousalDialog();
  if (dialog.resolver) {
    return Promise.resolve({ proceed: false, text: "", selectedEmotion: null });
  }

  dialog.message.textContent =
    `This post has a high arousal score (${percent}%). ` +
    "Quick check in: How does this make you feel? Do you want to proceed to the post?";
  dialog.overlay.classList.add("visible");
  dialog.selectedEmotion = preselectedEmotion;
  dialog.emotionButtons.forEach((btn) => {
    const isActive = btn.dataset.emotionKey === preselectedEmotion;
    btn.classList.toggle("active", isActive);
  });

  requestAnimationFrame(() => {
    dialog.input.focus();
  });

  return new Promise((resolve) => {
    dialog.resolver = resolve;
  });
}

function getHeuristicScore(text) {
  if (!text) return 0;

  const lowered = text.toLowerCase();
  const toxicWords = [
    "hate",
    "stupid",
    "idiot",
    "moron",
    "kill",
    "trash",
    "dumb",
    "loser",
    "shut up",
    "worthless",
  ];

  let hits = 0;
  toxicWords.forEach((word) => {
    if (lowered.includes(word)) hits += 1;
  });

  return Math.min(0.9, hits * 0.15);
}

async function getClassifier() {
  if (classifierUnavailable) {
    throw new Error("transformers-unavailable");
  }

  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { pipeline, env } =
        await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2");

      env.allowLocalModels = false;
      env.useBrowserCache = true;

      return pipeline("text-classification", "Xenova/toxic-bert");
    })().catch((error) => {
      classifierUnavailable = true;
      console.error("Could not initialize transformers toxicity model.", error);
      throw error;
    });
  }

  return classifierPromise;
}

function extractPostText(post) {
  const snippets = [];

  const title = post.querySelector("h3")?.textContent?.trim() || "";
  if (title) snippets.push(title);

  const bodySelectors = [
    '[slot="text-body"]',
    'div[data-click-id="text"]',
    "p",
    "li",
  ];

  bodySelectors.forEach((selector) => {
    post.querySelectorAll(selector).forEach((node) => {
      const value = node.textContent?.trim() || "";
      if (value) snippets.push(value);
    });
  });

  const unique = Array.from(new Set(snippets));
  const normalized = unique.join(" ").replace(/\s+/g, " ").trim();
  const fallback = post.textContent?.replace(/\s+/g, " ").trim() || "";
  const text = normalized || fallback;

  return text.slice(0, MAX_TEXT_LENGTH);
}

async function scorePost(postId, text) {
  if (scoreCache.has(postId)) return scoreCache.get(postId);

  let score = 0;
  try {
    const classifier = await getClassifier();
    const outputs = await classifier(text, { topk: null });
    const labels = Array.isArray(outputs) ? outputs : [outputs];

    labels.forEach((item) => {
      const label = String(item.label || "").toLowerCase();
      if (
        label.includes("toxic") ||
        label.includes("insult") ||
        label.includes("obscene") ||
        label.includes("threat") ||
        label.includes("hate")
      ) {
        score = Math.max(score, Number(item.score || 0));
      }
    });
  } catch (error) {
    console.warn(
      "Falling back to heuristic toxicity scoring for post:",
      postId,
      error,
    );
    score = getHeuristicScore(text);
  }

  scoreCache.set(postId, score);
  return score;
}

function getScoreClass(score) {
  if (score >= 0.7) return "high";
  if (score >= 0.35) return "medium";
  return "low";
}

function parseCompactNumber(text) {
  if (!text) return 0;

  const match = String(text)
    .toLowerCase()
    .replace(/,/g, "")
    .match(/(\d+(\.\d+)?)\s*([km])?/);

  if (!match) return 0;

  const value = Number(match[1]);
  const suffix = match[3];
  if (suffix === "k") return Math.round(value * 1000);
  if (suffix === "m") return Math.round(value * 1000000);
  return Math.round(value);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function loadPersistentLowScoreCache() {
  if (lowScoreCacheLoadPromise) return lowScoreCacheLoadPromise;

  lowScoreCacheLoadPromise = new Promise((resolve) => {
    chrome.storage.local.get([LOW_SCORE_CACHE_KEY], (result) => {
      const raw = result?.[LOW_SCORE_CACHE_KEY] || {};
      const now = Date.now();

      Object.entries(raw).forEach(([postId, entry]) => {
        if (
          !entry ||
          typeof entry.score !== "number" ||
          typeof entry.ts !== "number"
        ) {
          return;
        }

        if (now - entry.ts > LOW_SCORE_CACHE_TTL_MS) return;
        persistentLowScoreCache.set(postId, entry);
      });

      resolve();
    });
  });

  return lowScoreCacheLoadPromise;
}

function persistLowScoreCache() {
  const now = Date.now();
  const entries = Array.from(persistentLowScoreCache.entries())
    .filter(([, value]) => now - value.ts <= LOW_SCORE_CACHE_TTL_MS)
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, LOW_SCORE_CACHE_MAX_ENTRIES);

  persistentLowScoreCache.clear();
  entries.forEach(([key, value]) => persistentLowScoreCache.set(key, value));

  const serialized = {};
  entries.forEach(([key, value]) => {
    serialized[key] = value;
  });

  chrome.storage.local.set({ [LOW_SCORE_CACHE_KEY]: serialized });
}

function normalizePostUrl(postId) {
  try {
    const url = new URL(postId);
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}/`;
  } catch {
    return postId;
  }
}

function getPostId(post) {
  const link = post.querySelector('a[href*="/comments/"]');
  if (link?.href) {
    return normalizePostUrl(link.href);
  }

  const permalinkAttrs = [
    "permalink",
    "post-permalink",
    "content-href",
    "url",
    "href",
    "data-permalink",
  ];

  for (const attrName of permalinkAttrs) {
    const raw = post.getAttribute(attrName);
    if (!raw) continue;

    try {
      const absolute = new URL(raw, window.location.origin).href;
      if (absolute.includes("/comments/")) {
        return normalizePostUrl(absolute);
      }
    } catch {
      // Ignore malformed URLs in unknown attributes.
    }
  }

  const pathMatch = window.location.pathname.match(
    /\/comments\/([a-z0-9]+)\//i,
  );
  if (!pathMatch) return "";

  const currentPostKey = pathMatch[1].toLowerCase();
  const idCandidates = [
    post.id,
    post.getAttribute("id"),
    post.getAttribute("post-id"),
    post.getAttribute("thingid"),
    post.getAttribute("data-fullname"),
    post.getAttribute("fullname"),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  if (idCandidates.some((value) => value.includes(currentPostKey))) {
    return normalizePostUrl(window.location.href);
  }

  const postCount = document.querySelectorAll("shreddit-post").length;
  if (postCount === 1) {
    return normalizePostUrl(window.location.href);
  }

  return "";
}

function getCommentCount(post) {
  const attrValue =
    post.getAttribute("comment-count") ||
    post.getAttribute("comment_count") ||
    post.getAttribute("comments");
  if (attrValue) return parseCompactNumber(attrValue);

  const commentsLink = post.querySelector('a[href*="/comments/"]');
  const linkText = commentsLink?.textContent || "";
  const fromLink = parseCompactNumber(linkText);
  if (fromLink > 0) return fromLink;

  const bodyText = post.textContent || "";
  const match = bodyText.match(/(\d+(\.\d+)?\s*[km]?)\s+comments?/i);
  return parseCompactNumber(match?.[1] || "");
}

function getPostScore(post) {
  const attrValue =
    post.getAttribute("score") ||
    post.getAttribute("upvote-count") ||
    post.getAttribute("upvotes");
  if (attrValue) return parseCompactNumber(attrValue);

  const bodyText = post.textContent || "";
  const match = bodyText.match(/(\d+(\.\d+)?\s*[km]?)\s+(upvotes?|points?)/i);
  return parseCompactNumber(match?.[1] || "");
}

function getPostAgeHours(post) {
  const timeEl = post.querySelector("time");
  const datetime = timeEl?.getAttribute("datetime");
  if (!datetime) return 1;

  const created = new Date(datetime).getTime();
  if (!Number.isFinite(created)) return 1;

  const diffMs = Date.now() - created;
  return Math.max(1, diffMs / (1000 * 60 * 60));
}

function getTextIntensity(text) {
  if (!text) return 0;

  const letters = (text.match(/[a-z]/gi) || []).length;
  const upper = (text.match(/[A-Z]/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;

  const upperRatio = letters > 0 ? upper / letters : 0;
  const punctuationSignal = Math.min(1, (exclamations + questions) / 12);

  const hypeWords = [
    "wtf",
    "outrage",
    "insane",
    "unbelievable",
    "crazy",
    "ridiculous",
    "never",
    "always",
  ];
  const lowered = text.toLowerCase();
  let hypeHits = 0;
  hypeWords.forEach((word) => {
    if (lowered.includes(word)) hypeHits += 1;
  });
  const wordSignal = Math.min(1, hypeHits / 4);

  return clamp01(upperRatio * 0.4 + punctuationSignal * 0.3 + wordSignal * 0.3);
}

function computeLowScoreConcentration(scores) {
  const valid = scores.filter((value) => Number.isFinite(value));
  const count = valid.length;
  if (count === 0) return 0;

  const negRate = valid.filter((value) => value < 0).length / count;
  const severeRate = valid.filter((value) => value <= -5).length / count;
  const nearZeroRate = valid.filter((value) => value <= 1).length / count;

  // console.log(
  //   "Comment score distribution:",
  //   `total=${count}`,
  //   `negRate=${negRate.toFixed(2)}`,
  //   `severeRate=${severeRate.toFixed(2)}`,
  //   `nearZeroRate=${nearZeroRate.toFixed(2)}`,
  // );

  return clamp01(negRate * 0.1 + severeRate * 0.8 + nearZeroRate * 0.1);
}

function collectCommentScores(children, output, maxCount = 60) {
  if (!Array.isArray(children) || output.length >= maxCount) return;

  children.forEach((node) => {
    if (!node || output.length >= maxCount) return;
    if (node.kind !== "t1") return;

    const data = node.data || {};
    if (typeof data.score === "number") {
      output.push(data.score);
    }

    const replies = data.replies?.data?.children;
    if (Array.isArray(replies)) {
      collectCommentScores(replies, output, maxCount);
    }
  });
}

async function getLowScoreConcentration(postId) {
  await loadPersistentLowScoreCache();

  const normalizedPostId = normalizePostUrl(postId);
  if (commentSignalCache.has(normalizedPostId)) {
    return commentSignalCache.get(normalizedPostId);
  }

  const persisted = persistentLowScoreCache.get(normalizedPostId);
  if (persisted && Date.now() - persisted.ts <= LOW_SCORE_CACHE_TTL_MS) {
    commentSignalCache.set(normalizedPostId, persisted.score);
    return persisted.score;
  }

  let concentration = 0;
  try {
    const endpoint = `${normalizedPostId}.json?limit=15&depth=1&raw_json=1`;
    const response = await fetch(endpoint, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`comment-fetch-${response.status}`);
    }

    const payload = await response.json();
    const commentsListing = Array.isArray(payload) ? payload[1] : null;
    const children = commentsListing?.data?.children || [];

    const scores = [];
    collectCommentScores(children, scores, 60);
    concentration = computeLowScoreConcentration(scores);
  } catch (error) {
    console.warn(
      "Could not fetch comment scores for low-score concentration:",
      postId,
      error,
    );
    concentration = 0;
  }

  commentSignalCache.set(normalizedPostId, concentration);
  persistentLowScoreCache.set(normalizedPostId, {
    score: concentration,
    ts: Date.now(),
  });
  persistLowScoreCache();
  return concentration;
}

async function computeArousalScore(post, postId, text) {
  const comments = getCommentCount(post);
  const score = Math.max(0, getPostScore(post));
  const ageHours = getPostAgeHours(post);

  const ratioSignal = clamp01(comments / Math.max(score, 1));
  const velocitySignal = clamp01(comments / ageHours / 25);
  const lowApprovalSignal =
    comments > 0 ? clamp01((comments - score) / Math.max(comments, 1)) : 0;
  const textSignal = getTextIntensity(text);
  const lowScoreConcentration = await getLowScoreConcentration(postId);

  return clamp01(
    ratioSignal * 0.5 +
      // velocitySignal * 0.25 +
      // // lowApprovalSignal * 0.15 +
      // textSignal * 0.1 +
      lowScoreConcentration * 0.5,
  );
}

function createSignalRow() {
  const row = document.createElement("div");
  row.className = "reddit-toxicity-row";

  const toxicityBadge = document.createElement("span");
  toxicityBadge.className = "reddit-toxicity-badge pending";
  toxicityBadge.textContent = "Toxicity: analyzing...";

  const arousalBadge = document.createElement("span");
  arousalBadge.className = "reddit-arousal-badge pending";
  arousalBadge.textContent = "Arousal: analyzing...";

  row.appendChild(toxicityBadge);
  row.appendChild(arousalBadge);
  return { row, toxicityBadge, arousalBadge };
}

function isLikelyPostNavigationClick(post, event) {
  const target = event.target;
  if (!(target instanceof Element)) return false;

  if (target.closest(".reddit-sentiment-panel")) return false;

  const anchor = target.closest("a[href]");
  if (!anchor) return false;

  const href = anchor.getAttribute("href") || "";
  if (href.includes("/comments/")) return true;
  if (anchor.href && anchor.href.includes("/comments/")) return true;

  return post.contains(anchor);
}

function getNavigationAnchorFromClick(post, event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;

  if (target.closest(".reddit-sentiment-panel")) return null;

  const anchor = target.closest("a[href]");
  if (!anchor) return null;
  if (anchor.href && anchor.href.includes("/comments/")) return anchor;

  return post.contains(anchor) ? anchor : null;
}

function applyEmotionSelectionToPost(post, emotionKey) {
  const emotionBar = post.querySelector(".reddit-emotion-bar");
  if (!emotionBar) return;

  emotionBar.querySelectorAll(".reddit-emotion-btn").forEach((button) => {
    const isActive =
      button.textContent?.trim().toLowerCase() === emotionKey?.toLowerCase();
    button.classList.toggle("active", Boolean(isActive));
  });
}

function attachArousalClickGuard(post, postId) {
  if (post.dataset.arousalGuardAttached === "true") return;

  post.addEventListener("click", async (event) => {
    if (event.defaultPrevented) return;
    if (!isLikelyPostNavigationClick(post, event)) return;

    const anchor = getNavigationAnchorFromClick(post, event);
    if (!anchor?.href) return;

    const score = arousalCache.get(postId);
    if (typeof score !== "number" || score <= 0.5) return;

    event.preventDefault();
    event.stopPropagation();

    const percent = Math.round(score * 100);
    const currentEmotion = await loadEmotionAsync(postId);
    const { proceed, selectedEmotion } = await showArousalDialog(
      percent,
      currentEmotion,
    );

    if (!proceed) return;

    if (selectedEmotion) {
      saveEmotion(postId, selectedEmotion);
      applyEmotionSelectionToPost(post, selectedEmotion);
    }

    if (anchor.target === "_blank" || event.ctrlKey || event.metaKey) {
      window.open(anchor.href, "_blank", "noopener");
    } else {
      window.location.href = anchor.href;
    }
  });

  post.dataset.arousalGuardAttached = "true";
}

async function renderToxicity(post, postId, badge) {
  const text = extractPostText(post);
  if (!text) {
    badge.className = "reddit-toxicity-badge error";
    badge.textContent = "Toxicity: n/a";
    return;
  }

  const score = await scorePost(postId, text);
  if (!badge.isConnected) return;

  const percent = Math.round(score * 100);
  badge.className = `reddit-toxicity-badge ${getScoreClass(score)}`;
  badge.textContent = `Toxicity: ${percent}%`;
}

async function renderArousal(post, postId, badge) {
  const text = extractPostText(post);
  if (!text) {
    badge.className = "reddit-arousal-badge error";
    badge.textContent = "Arousal: n/a";
    return;
  }

  let score = arousalCache.get(postId);
  if (typeof score !== "number") {
    score = await computeArousalScore(post, postId, text);
    arousalCache.set(postId, score);
  }

  if (!badge.isConnected) return;

  const percent = Math.round(score * 100);
  badge.className = `reddit-arousal-badge ${getScoreClass(score)}`;
  badge.textContent = `Arousal: ${percent}%`;
}

function createEmotionBar(postId) {
  const bar = document.createElement("div");
  bar.className = "reddit-emotion-bar";

  [
    "click",
    "auxclick",
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "touchstart",
    "touchend",
  ].forEach((eventName) => {
    bar.addEventListener(eventName, stopBubble);
  });

  EMOTIONS.forEach((emotion) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reddit-emotion-btn";
    btn.textContent = emotion.label;

    btn.addEventListener("click", (event) => {
      blockNavigation(event);
      saveEmotion(postId, emotion.key);

      bar
        .querySelectorAll(".reddit-emotion-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });

    [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "touchstart",
      "touchend",
    ].forEach((eventName) => {
      btn.addEventListener(eventName, stopBubble);
    });

    loadEmotion(postId, (saved) => {
      if (saved === emotion.key) {
        btn.classList.add("active");
      }
    });

    bar.appendChild(btn);
  });

  return bar;
}

function injectIntoPosts() {
  const posts = document.querySelectorAll("shreddit-post");

  posts.forEach((post) => {
    const postId = getPostId(post);
    if (!postId) return;

    attachArousalClickGuard(post, postId);

    if (post.querySelector(".reddit-sentiment-panel")) return;

    const panel = document.createElement("div");
    panel.className = "reddit-sentiment-panel";

    const { row, toxicityBadge, arousalBadge } = createSignalRow();
    const emotions = createEmotionBar(postId);
    panel.appendChild(row);
    panel.appendChild(emotions);

    const footer = post.querySelector("footer");
    if (footer) footer.insertAdjacentElement("afterend", panel);
    else post.appendChild(panel);

    renderToxicity(post, postId, toxicityBadge);
    renderArousal(post, postId, arousalBadge);
  });
}

const observer = new MutationObserver(() => injectIntoPosts());

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

injectIntoPosts();
