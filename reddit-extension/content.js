(() => {
  console.log("Emotion extension v3 loaded");

  const app = (window.RedditEmotionExt = window.RedditEmotionExt || {});
  if (app.constants && app.state) return;

  app.constants = {
    MAX_TEXT_LENGTH: 2000,
    LOW_SCORE_CACHE_KEY: "lowScoreConcentrationCache",
    LOW_SCORE_CACHE_TTL_MS: 12 * 60 * 60 * 1000,
    LOW_SCORE_CACHE_MAX_ENTRIES: 500,
    EMOTIONS: [
      { key: "happy", label: "Happy" },
      { key: "angry", label: "Angry" },
      { key: "sad", label: "Sad" },
      { key: "surprised", label: "Surprised" },
      { key: "love", label: "Love" },
    ],
  };

  app.state = {
    scoreCache: new Map(),
    arousalCache: new Map(),
    commentSignalCache: new Map(),
    persistentLowScoreCache: new Map(),
    classifierPromise: null,
    classifierUnavailable: false,
    lowScoreCacheLoadPromise: null,
    arousalDialogState: null,
  };
})();
