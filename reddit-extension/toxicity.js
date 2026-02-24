(() => {
  const app = window.RedditEmotionExt;
  if (!app) return;

  const { MAX_TEXT_LENGTH } = app.constants;

  app.getHeuristicScore = (text) => {
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
  };

  app.getClassifier = async () => {
    if (app.state.classifierUnavailable) {
      throw new Error("transformers-unavailable");
    }

    if (!app.state.classifierPromise) {
      app.state.classifierPromise = (async () => {
        const { pipeline, env } = await import(
          "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2"
        );

        env.allowLocalModels = false;
        env.useBrowserCache = true;

        return pipeline("text-classification", "Xenova/toxic-bert");
      })().catch((error) => {
        app.state.classifierUnavailable = true;
        console.error("Could not initialize transformers toxicity model.", error);
        throw error;
      });
    }

    return app.state.classifierPromise;
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

    return text.slice(0, MAX_TEXT_LENGTH);
  };

  app.scorePost = async (postId, text) => {
    if (app.state.scoreCache.has(postId)) {
      return app.state.scoreCache.get(postId);
    }

    let score = 0;
    try {
      const classifier = await app.getClassifier();
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
      score = app.getHeuristicScore(text);
    }

    app.state.scoreCache.set(postId, score);
    return score;
  };
})();
