(() => {
  const app = window.RedditBaselineExt;
  if (!app) return;

  app.stopBubble = (event) => {
    event.stopPropagation();
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
    if (!post) return "";

    const snippets = [];
    const title = post.querySelector("h3")?.textContent?.trim() || "";
    if (title) snippets.push(title);

    ['[slot="text-body"]', 'div[data-click-id="text"]', "p", "li"].forEach(
      (selector) => {
        post.querySelectorAll(selector).forEach((node) => {
          const value = node.textContent?.trim() || "";
          if (value) snippets.push(value);
        });
      },
    );

    const normalized = Array.from(new Set(snippets))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const fallback = post.textContent?.replace(/\s+/g, " ").trim() || "";
    return (normalized || fallback).slice(0, app.constants.MAX_TEXT_LENGTH);
  };
})();
