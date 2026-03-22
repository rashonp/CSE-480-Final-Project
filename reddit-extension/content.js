(() => {
  console.log("Emotion extension v3 loaded");

  const app = (window.RedditEmotionExt = window.RedditEmotionExt || {});
  if (app.constants && app.state) return;

  app.constants = {
    MAX_TEXT_LENGTH: 2000,
    LOW_SCORE_CACHE_KEY: "lowScoreConcentrationCache",
    LOW_SCORE_CACHE_TTL_MS: 12 * 60 * 60 * 1000,
    LOW_SCORE_CACHE_MAX_ENTRIES: 500,
    SHOWN_AROUSAL_PROMPTS_KEY: "shownArousalPrompts",
    LLM_AROUSAL_CACHE_KEY: "llmArousalCache",
    LLM_AROUSAL_CACHE_TTL_MS: 24 * 60 * 60 * 1000,
    LLM_AROUSAL_CACHE_MAX_ENTRIES: 500,
    EMOTIONS: [
      { key: "happy", label: "Happy" },
      { key: "angry", label: "Angry" },
      { key: "sad", label: "Sad" },
      { key: "surprised", label: "Surprised" },
      { key: "love", label: "Love" },
    ],
  };

  app.state = {
    arousalCache: new Map(),
    commentSignalCache: new Map(),
    persistentLowScoreCache: new Map(),
    llmArousalCache: new Map(),
    persistentLlmArousalCache: new Map(),
    shownArousalPrompts: new Set(),
    commentGuardBypassTargets: new WeakSet(),
    commentGuardActivePostIds: new Set(),
    lowScoreCacheLoadPromise: null,
    llmArousalCacheLoadPromise: null,
    shownArousalPromptsLoadPromise: null,
    arousalDialogState: null,
  };
})();
