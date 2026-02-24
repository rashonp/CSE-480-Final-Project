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
})();
