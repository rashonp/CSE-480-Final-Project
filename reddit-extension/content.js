(() => {
  console.log("Emotion extension v3 loaded");

  const app = (window.RedditEmotionExt = window.RedditEmotionExt || {});
  if (app.constants && app.state) return;

  app.constants = {
    MAX_TEXT_LENGTH: 2000,
    LOW_SCORE_CACHE_KEY: "lowScoreConcentrationCache",
    LOW_SCORE_CACHE_TTL_MS: 12 * 60 * 60 * 1000,
    LOW_SCORE_CACHE_MAX_ENTRIES: 500,
    PROFILE_ENTRIES_KEY: "profileEntries",
    PROFILE_ENTRIES_MAX: 100,
    USER_REPORTED_TRIGGERS_KEY: "userReportedTriggers",
    AROUSAL_PROMPT_THRESHOLD_KEY: "arousalPromptThreshold",
    DEFAULT_AROUSAL_PROMPT_THRESHOLD: 0.1,
    HAS_SEEN_WELCOME_KEY: "hasSeenWelcome",
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
    profileEntries: [],
    userReportedTriggers: "",
    arousalPromptThreshold: 0.1,
    hasSeenWelcome: false,
    commentGuardBypassTargets: new WeakSet(),
    commentGuardActivePostIds: new Set(),
    lowScoreCacheLoadPromise: null,
    llmArousalCacheLoadPromise: null,
    shownArousalPromptsLoadPromise: null,
    profileEntriesLoadPromise: null,
    userReportedTriggersLoadPromise: null,
    arousalPromptThresholdLoadPromise: null,
    hasSeenWelcomeLoadPromise: null,
    arousalDialogState: null,
    welcomeDialogState: null,
  };
})();
