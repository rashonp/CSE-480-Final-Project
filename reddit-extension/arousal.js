(() => {
  const app = window.RedditEmotionExt;
  if (!app) return;

  const { LOW_SCORE_CACHE_TTL_MS } = app.constants;

  app.getPostId = (post) => {
    const link = post.querySelector('a[href*="/comments/"]');
    if (link?.href) {
      return app.normalizePostUrl(link.href);
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
          return app.normalizePostUrl(absolute);
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
      return app.normalizePostUrl(window.location.href);
    }

    const postCount = document.querySelectorAll("shreddit-post").length;
    if (postCount === 1) {
      return app.normalizePostUrl(window.location.href);
    }

    return "";
  };

  app.getCommentCount = (post) => {
    const attrValue =
      post.getAttribute("comment-count") ||
      post.getAttribute("comment_count") ||
      post.getAttribute("comments");
    if (attrValue) return app.parseCompactNumber(attrValue);

    const commentsLink = post.querySelector('a[href*="/comments/"]');
    const linkText = commentsLink?.textContent || "";
    const fromLink = app.parseCompactNumber(linkText);
    if (fromLink > 0) return fromLink;

    const bodyText = post.textContent || "";
    const match = bodyText.match(/(\d+(\.\d+)?\s*[km]?)\s+comments?/i);
    return app.parseCompactNumber(match?.[1] || "");
  };

  app.getPostScore = (post) => {
    const attrValue =
      post.getAttribute("score") ||
      post.getAttribute("upvote-count") ||
      post.getAttribute("upvotes");
    if (attrValue) return app.parseCompactNumber(attrValue);

    const bodyText = post.textContent || "";
    const match = bodyText.match(
      /(\d+(\.\d+)?\s*[km]?)\s+(upvotes?|points?)/i,
    );
    return app.parseCompactNumber(match?.[1] || "");
  };

  app.getPostAgeHours = (post) => {
    const timeEl = post.querySelector("time");
    const datetime = timeEl?.getAttribute("datetime");
    if (!datetime) return 1;

    const created = new Date(datetime).getTime();
    if (!Number.isFinite(created)) return 1;

    const diffMs = Date.now() - created;
    return Math.max(1, diffMs / (1000 * 60 * 60));
  };

  app.getTextIntensity = (text) => {
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

    return app.clamp01(
      upperRatio * 0.4 + punctuationSignal * 0.3 + wordSignal * 0.3,
    );
  };

  app.computeLowScoreConcentration = (scores) => {
    const valid = scores.filter((value) => Number.isFinite(value));
    const count = valid.length;
    if (count === 0) return 0;

    const negRate = valid.filter((value) => value < 0).length / count;
    const severeRate = valid.filter((value) => value <= -5).length / count;
    const nearZeroRate = valid.filter((value) => value <= 1).length / count;

    return app.clamp01(negRate * 0.1 + severeRate * 0.8 + nearZeroRate * 0.1);
  };

  app.collectCommentScores = (children, output, maxCount = 60) => {
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
        app.collectCommentScores(replies, output, maxCount);
      }
    });
  };

  app.getLowScoreConcentration = async (postId) => {
    await app.loadPersistentLowScoreCache();

    const normalizedPostId = app.normalizePostUrl(postId);
    if (app.state.commentSignalCache.has(normalizedPostId)) {
      return app.state.commentSignalCache.get(normalizedPostId);
    }

    const persisted = app.state.persistentLowScoreCache.get(normalizedPostId);
    if (persisted && Date.now() - persisted.ts <= LOW_SCORE_CACHE_TTL_MS) {
      app.state.commentSignalCache.set(normalizedPostId, persisted.score);
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
      app.collectCommentScores(children, scores, 60);
      concentration = app.computeLowScoreConcentration(scores);
    } catch (error) {
      console.warn(
        "Could not fetch comment scores for low-score concentration:",
        postId,
        error,
      );
      concentration = 0;
    }

    app.state.commentSignalCache.set(normalizedPostId, concentration);
    app.state.persistentLowScoreCache.set(normalizedPostId, {
      score: concentration,
      ts: Date.now(),
    });
    app.persistLowScoreCache();
    return concentration;
  };

  app.computeArousalScore = async (post, postId, text) => {
    const comments = app.getCommentCount(post);
    const score = Math.max(0, app.getPostScore(post));
    const ratioSignal = app.clamp01(comments / Math.max(score, 1));
    // Reserved for future text-driven arousal signals.
    void text;
    const lowScoreConcentration = await app.getLowScoreConcentration(postId);
    return app.clamp01(ratioSignal * 0.5 + lowScoreConcentration * 0.5);
  };
})();
