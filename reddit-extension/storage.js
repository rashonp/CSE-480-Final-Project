(() => {
  const app = window.RedditEmotionExt;
  if (!app) return;

  const {
    LOW_SCORE_CACHE_KEY,
    LOW_SCORE_CACHE_TTL_MS,
    LOW_SCORE_CACHE_MAX_ENTRIES,
    PROFILE_ENTRIES_KEY,
    PROFILE_ENTRIES_MAX,
    USER_REPORTED_TRIGGERS_KEY,
    AROUSAL_PROMPT_THRESHOLD_KEY,
    DEFAULT_AROUSAL_PROMPT_THRESHOLD,
    HAS_SEEN_WELCOME_KEY,
    SHOWN_AROUSAL_PROMPTS_KEY,
    LLM_AROUSAL_CACHE_KEY,
    LLM_AROUSAL_CACHE_TTL_MS,
    LLM_AROUSAL_CACHE_MAX_ENTRIES,
  } = app.constants;
  const {
    persistentLowScoreCache,
    persistentLlmArousalCache,
    shownArousalPrompts,
    profileEntries,
    userReportedTriggers,
  } = app.state;

  app.invalidateArousalDetails = () => {
    app.state.arousalCache.clear();
  };

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

  app.loadHasSeenWelcome = () => {
    if (app.state.hasSeenWelcomeLoadPromise) {
      return app.state.hasSeenWelcomeLoadPromise;
    }

    app.state.hasSeenWelcomeLoadPromise = new Promise((resolve) => {
      chrome.storage.local.get([HAS_SEEN_WELCOME_KEY], (result) => {
        app.state.hasSeenWelcome = result?.[HAS_SEEN_WELCOME_KEY] === true;
        resolve(app.state.hasSeenWelcome);
      });
    });

    return app.state.hasSeenWelcomeLoadPromise;
  };

  app.markWelcomeSeen = async () => {
    app.state.hasSeenWelcome = true;
    app.state.hasSeenWelcomeLoadPromise = Promise.resolve(true);

    return new Promise((resolve) => {
      chrome.storage.local.set({ [HAS_SEEN_WELCOME_KEY]: true }, () => resolve());
    });
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

  app.loadProfileEntries = () => {
    if (app.state.profileEntriesLoadPromise) {
      return app.state.profileEntriesLoadPromise;
    }

    app.state.profileEntriesLoadPromise = new Promise((resolve) => {
      chrome.storage.local.get([PROFILE_ENTRIES_KEY], (result) => {
        const raw = Array.isArray(result?.[PROFILE_ENTRIES_KEY])
          ? result[PROFILE_ENTRIES_KEY]
          : [];

        profileEntries.splice(
          0,
          profileEntries.length,
          ...raw.filter(
            (entry) =>
              entry &&
              typeof entry.postId === "string" &&
              typeof entry.summary === "string" &&
              typeof entry.selectedEmotion === "string" &&
              typeof entry.savedAt === "number",
          ),
        );

        resolve(profileEntries);
      });
    });

    return app.state.profileEntriesLoadPromise;
  };

  app.saveProfileEntry = async (entry) => {
    await app.loadProfileEntries();

    const nextEntries = [
      entry,
      ...profileEntries.filter(
        (item) =>
          !(
            item.postId === entry.postId &&
            item.selectedEmotion === entry.selectedEmotion &&
            item.savedAt === entry.savedAt
          ),
      ),
    ].slice(0, PROFILE_ENTRIES_MAX);

    profileEntries.splice(0, profileEntries.length, ...nextEntries);
    app.invalidateArousalDetails();
    app.state.profileEntriesLoadPromise = Promise.resolve(profileEntries);

    return new Promise((resolve) => {
      chrome.storage.local.set({ [PROFILE_ENTRIES_KEY]: nextEntries }, () =>
        resolve(),
      );
    });
  };

  app.loadUserReportedTriggers = () => {
    if (app.state.userReportedTriggersLoadPromise) {
      return app.state.userReportedTriggersLoadPromise;
    }

    app.state.userReportedTriggersLoadPromise = new Promise((resolve) => {
      chrome.storage.local.get([USER_REPORTED_TRIGGERS_KEY], (result) => {
        app.state.userReportedTriggers = String(
          result?.[USER_REPORTED_TRIGGERS_KEY] || "",
        ).trim();
        resolve(app.state.userReportedTriggers);
      });
    });

    return app.state.userReportedTriggersLoadPromise;
  };

  app.loadArousalPromptThreshold = () => {
    if (app.state.arousalPromptThresholdLoadPromise) {
      return app.state.arousalPromptThresholdLoadPromise;
    }

    app.state.arousalPromptThresholdLoadPromise = new Promise((resolve) => {
      chrome.storage.local.get([AROUSAL_PROMPT_THRESHOLD_KEY], (result) => {
        const raw = Number(result?.[AROUSAL_PROMPT_THRESHOLD_KEY]);
        app.state.arousalPromptThreshold = Number.isFinite(raw)
          ? app.clamp01(raw)
          : DEFAULT_AROUSAL_PROMPT_THRESHOLD;
        resolve(app.state.arousalPromptThreshold);
      });
    });

    return app.state.arousalPromptThresholdLoadPromise;
  };

  app.saveArousalPromptThreshold = async (value) => {
    const nextValue = app.clamp01(Number(value));
    app.state.arousalPromptThreshold = Number.isFinite(nextValue)
      ? nextValue
      : DEFAULT_AROUSAL_PROMPT_THRESHOLD;
    app.state.arousalPromptThresholdLoadPromise = Promise.resolve(
      app.state.arousalPromptThreshold,
    );

    return new Promise((resolve) => {
      chrome.storage.local.set(
        { [AROUSAL_PROMPT_THRESHOLD_KEY]: app.state.arousalPromptThreshold },
        () => resolve(app.state.arousalPromptThreshold),
      );
    });
  };

  app.saveUserReportedTriggers = async (value) => {
    const nextValue = String(value || "").trim();
    app.state.userReportedTriggers = nextValue;
    app.state.userReportedTriggersLoadPromise = Promise.resolve(nextValue);
    app.invalidateArousalDetails();

    return new Promise((resolve) => {
      chrome.storage.local.set({ [USER_REPORTED_TRIGGERS_KEY]: nextValue }, () =>
        resolve(nextValue),
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
            typeof entry.genericScore !== "number" ||
            typeof entry.personalizedScore !== "number" ||
            typeof entry.ts !== "number" ||
            typeof entry.genericReason !== "string" ||
            typeof entry.personalizedReason !== "string" ||
            typeof entry.label !== "string" ||
            typeof entry.primaryEmotion !== "string" ||
            typeof entry.contextKey !== "string"
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

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (Object.prototype.hasOwnProperty.call(changes, PROFILE_ENTRIES_KEY)) {
      const nextValue = Array.isArray(changes[PROFILE_ENTRIES_KEY]?.newValue)
        ? changes[PROFILE_ENTRIES_KEY].newValue
        : [];
      profileEntries.splice(
        0,
        profileEntries.length,
        ...nextValue.filter(
          (entry) =>
            entry &&
            typeof entry.postId === "string" &&
            typeof entry.summary === "string" &&
            typeof entry.selectedEmotion === "string" &&
            typeof entry.savedAt === "number",
        ),
      );
      app.state.profileEntriesLoadPromise = Promise.resolve(profileEntries);
      app.invalidateArousalDetails();
    }

    if (
      Object.prototype.hasOwnProperty.call(changes, USER_REPORTED_TRIGGERS_KEY)
    ) {
      app.state.userReportedTriggers = String(
        changes[USER_REPORTED_TRIGGERS_KEY]?.newValue || "",
      ).trim();
      app.state.userReportedTriggersLoadPromise = Promise.resolve(
        app.state.userReportedTriggers,
      );
      app.invalidateArousalDetails();
    }

    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        AROUSAL_PROMPT_THRESHOLD_KEY,
      )
    ) {
      const raw = Number(changes[AROUSAL_PROMPT_THRESHOLD_KEY]?.newValue);
      app.state.arousalPromptThreshold = Number.isFinite(raw)
        ? app.clamp01(raw)
        : DEFAULT_AROUSAL_PROMPT_THRESHOLD;
      app.state.arousalPromptThresholdLoadPromise = Promise.resolve(
        app.state.arousalPromptThreshold,
      );
    }
  });
})();
