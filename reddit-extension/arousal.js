(() => {
  const app = window.RedditEmotionExt;
  if (!app) return;

  const { LOW_SCORE_CACHE_TTL_MS, LLM_AROUSAL_CACHE_TTL_MS } = app.constants;

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

  app.computeHeuristicArousalScore = async (post, postId) => {
    const comments = app.getCommentCount(post);
    const score = Math.max(0, app.getPostScore(post));
    const ratioSignal = app.clamp01(comments / Math.max(score, 1));
    const lowScoreConcentration = await app.getLowScoreConcentration(postId);
    return app.clamp01(ratioSignal * 0.5 + lowScoreConcentration * 0.5);
  };

  app.extractArousalAnalysis = (payload) => {
    const raw = Number(payload?.arousal_score);
    if (!Number.isFinite(raw)) {
      throw new Error("invalid-llm-arousal-score");
    }

    return {
      arousal_score: app.clamp01(raw),
      label: String(payload?.label || "medium"),
      primary_emotion: String(payload?.primary_emotion || "other"),
      reason: String(payload?.reason || "").trim(),
    };
  };

  app.requestLlmArousalAnalysis = (text) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "reddit-emotion-arousal-analysis",
          text,
        },
        (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }

          if (!response?.ok) {
            reject(new Error(response?.error || "llm-arousal-request-failed"));
            return;
          }

          resolve(response.data || {});
        },
      );
    });

  app.getLlmArousalAnalysis = async (postId, text) => {
    const normalizedPostId = app.normalizePostUrl(postId);
    await app.loadPersistentLlmArousalCache();

    if (app.state.llmArousalCache.has(normalizedPostId)) {
      return app.state.llmArousalCache.get(normalizedPostId);
    }

    const persisted = app.state.persistentLlmArousalCache.get(normalizedPostId);
    if (persisted && Date.now() - persisted.ts <= LLM_AROUSAL_CACHE_TTL_MS) {
      app.state.llmArousalCache.set(normalizedPostId, persisted);
      return persisted;
    }

    const payload = await app.requestLlmArousalAnalysis(text);
    const analysis = app.extractArousalAnalysis(payload);
    const cacheEntry = {
      score: analysis.arousal_score,
      label: analysis.label,
      primaryEmotion: analysis.primary_emotion,
      reason: analysis.reason,
      ts: Date.now(),
    };

    app.state.llmArousalCache.set(normalizedPostId, cacheEntry);
    app.state.persistentLlmArousalCache.set(normalizedPostId, cacheEntry);
    app.persistLlmArousalCache();
    return cacheEntry;
  };

  app.computeArousalDetails = async (post, postId, text) => {
    const heuristicPromise = app.computeHeuristicArousalScore(post, postId);
    const [heuristicResult, llmResult] = await Promise.allSettled([
      heuristicPromise,
      app.getLlmArousalAnalysis(postId, text),
    ]);

    if (heuristicResult.status !== "fulfilled") {
      throw heuristicResult.reason;
    }

    const heuristicScore = heuristicResult.value;
    if (llmResult.status !== "fulfilled") {
      return {
        finalScore: heuristicScore,
        heuristicScore,
        llmScore: null,
        llmReason: "LLM analysis unavailable.",
        llmLabel: null,
        primaryEmotion: null,
      };
    }

    const llmAnalysis = llmResult.value;
    const llmScore = app.clamp01(Number(llmAnalysis.score || 0));
    return {
      finalScore: app.clamp01(heuristicScore * 0.5 + llmScore * 0.5),
      heuristicScore,
      llmScore,
      llmReason: llmAnalysis.reason || "",
      llmLabel: llmAnalysis.label || null,
      primaryEmotion: llmAnalysis.primaryEmotion || null,
    };
  };
})();
