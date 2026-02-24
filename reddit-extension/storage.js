(() => {
  const app = window.RedditEmotionExt;
  if (!app) return;

  const { LOW_SCORE_CACHE_KEY, LOW_SCORE_CACHE_TTL_MS, LOW_SCORE_CACHE_MAX_ENTRIES } =
    app.constants;
  const { persistentLowScoreCache } = app.state;

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
})();
