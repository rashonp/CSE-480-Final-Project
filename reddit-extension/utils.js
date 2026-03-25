(() => {
  const app = window.RedditEmotionExt;
  if (!app) return;

  app.stopBubble = (event) => {
    event.stopPropagation();
  };

  app.blockNavigation = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  app.getScoreClass = (score) => {
    if (score >= 0.7) return "high";
    if (score >= 0.35) return "medium";
    return "low";
  };

  app.parseCompactNumber = (text) => {
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
  };

  app.clamp01 = (value) => Math.max(0, Math.min(1, value));

  app.hashString = (value) => {
    const input = String(value || "");
    let hash = 2166136261;

    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return `h${(hash >>> 0).toString(16)}`;
  };

  app.normalizePostUrl = (postId) => {
    try {
      const url = new URL(postId);
      url.search = "";
      url.hash = "";
      return `${url.origin}${url.pathname.replace(/\/+$/, "")}/`;
    } catch {
      return postId;
    }
  };

  app.extractPostText = (post) => {
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

    return text.slice(0, app.constants.MAX_TEXT_LENGTH);
  };
})();
