(() => {
  const app = window.RedditEmotionExt;
  if (!app) return;

  const {
    LOW_SCORE_CACHE_KEY,
    LOW_SCORE_CACHE_TTL_MS,
    LOW_SCORE_CACHE_MAX_ENTRIES,
    SHOWN_AROUSAL_PROMPTS_KEY,
    LLM_AROUSAL_CACHE_KEY,
    LLM_AROUSAL_CACHE_TTL_MS,
    LLM_AROUSAL_CACHE_MAX_ENTRIES,
  } = app.constants;
  const {
    persistentLowScoreCache,
    persistentLlmArousalCache,
    shownArousalPrompts,
  } = app.state;

  app.saveEmotion = (postId, emotion) => {
    chrome.storage.local.get(["emotionTags"], (result) => {
      const tags = result.emotionTags || {};
      tags[postId] = emotion;
      chrome.storage.local.set({ emotionTags: tags });
    });
  };

  app.loadEmotion = (postId, callback) => {
    chrome.storage.local.get(["emotionTags"], (result) => {
      const tags = result.emotionTags || {};
      callback(tags[postId]);
    });
  };

  app.loadEmotionAsync = (postId) =>
    new Promise((resolve) => {
      app.loadEmotion(postId, (value) => resolve(value || null));
    });

  app.loadShownArousalPrompts = () => {
    if (app.state.shownArousalPromptsLoadPromise) {
      return app.state.shownArousalPromptsLoadPromise;
    }

    app.state.shownArousalPromptsLoadPromise = new Promise((resolve) => {
      chrome.storage.local.get([SHOWN_AROUSAL_PROMPTS_KEY], (result) => {
        const raw = result?.[SHOWN_AROUSAL_PROMPTS_KEY] || {};
        shownArousalPrompts.clear();

        Object.entries(raw).forEach(([postId, wasShown]) => {
          if (wasShown === true) {
            shownArousalPrompts.add(postId);
          }
        });

        resolve();
      });
    });

    return app.state.shownArousalPromptsLoadPromise;
  };

  app.hasShownArousalPrompt = async (postId) => {
    const normalizedPostId = app.normalizePostUrl(postId);
    await app.loadShownArousalPrompts();
    return shownArousalPrompts.has(normalizedPostId);
  };

  app.markArousalPromptShown = async (postId) => {
    const normalizedPostId = app.normalizePostUrl(postId);
    await app.loadShownArousalPrompts();
    shownArousalPrompts.add(normalizedPostId);

    const serialized = {};
    shownArousalPrompts.forEach((value) => {
      serialized[value] = true;
    });

    return new Promise((resolve) => {
      chrome.storage.local.set({ [SHOWN_AROUSAL_PROMPTS_KEY]: serialized }, () =>
        resolve(),
      );
    });
  };

  app.loadPersistentLowScoreCache = () => {
    if (app.state.lowScoreCacheLoadPromise) {
      return app.state.lowScoreCacheLoadPromise;
    }

    app.state.lowScoreCacheLoadPromise = new Promise((resolve) => {
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

    return app.state.lowScoreCacheLoadPromise;
  };

  app.persistLowScoreCache = () => {
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
  };

  app.loadPersistentLlmArousalCache = () => {
    if (app.state.llmArousalCacheLoadPromise) {
      return app.state.llmArousalCacheLoadPromise;
    }

    app.state.llmArousalCacheLoadPromise = new Promise((resolve) => {
      chrome.storage.local.get([LLM_AROUSAL_CACHE_KEY], (result) => {
        const raw = result?.[LLM_AROUSAL_CACHE_KEY] || {};
        const now = Date.now();

        Object.entries(raw).forEach(([postId, entry]) => {
          if (
            !entry ||
            typeof entry.score !== "number" ||
            typeof entry.ts !== "number" ||
            typeof entry.reason !== "string" ||
            typeof entry.label !== "string" ||
            typeof entry.primaryEmotion !== "string"
          ) {
            return;
          }

          if (now - entry.ts > LLM_AROUSAL_CACHE_TTL_MS) return;
          persistentLlmArousalCache.set(postId, entry);
        });

        resolve();
      });
    });

    return app.state.llmArousalCacheLoadPromise;
  };

  app.persistLlmArousalCache = () => {
    const now = Date.now();
    const entries = Array.from(persistentLlmArousalCache.entries())
      .filter(([, value]) => now - value.ts <= LLM_AROUSAL_CACHE_TTL_MS)
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, LLM_AROUSAL_CACHE_MAX_ENTRIES);

    persistentLlmArousalCache.clear();
    entries.forEach(([key, value]) => persistentLlmArousalCache.set(key, value));

    const serialized = {};
    entries.forEach(([key, value]) => {
      serialized[key] = value;
    });

    chrome.storage.local.set({ [LLM_AROUSAL_CACHE_KEY]: serialized });
  };
})();
