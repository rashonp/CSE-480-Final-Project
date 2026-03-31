(() => {
  const app = window.RedditBaselineExt;
  if (!app) return;

  const { SHOWN_COMMENT_COOLDOWNS_KEY } = app.constants;
  const { shownCommentCooldowns } = app.state;

  app.loadShownCommentCooldowns = () => {
    if (app.state.shownCommentCooldownsLoadPromise) {
      return app.state.shownCommentCooldownsLoadPromise;
    }

    app.state.shownCommentCooldownsLoadPromise = new Promise((resolve) => {
      chrome.storage.local.get([SHOWN_COMMENT_COOLDOWNS_KEY], (result) => {
        const raw = result?.[SHOWN_COMMENT_COOLDOWNS_KEY] || {};
        shownCommentCooldowns.clear();

        Object.entries(raw).forEach(([postId, wasShown]) => {
          if (wasShown === true) {
            shownCommentCooldowns.add(postId);
          }
        });

        resolve();
      });
    });

    return app.state.shownCommentCooldownsLoadPromise;
  };

  app.hasShownCommentCooldown = async (postId) => {
    const normalizedPostId = app.normalizePostUrl(postId);
    await app.loadShownCommentCooldowns();
    return shownCommentCooldowns.has(normalizedPostId);
  };

  app.markCommentCooldownShown = async (postId) => {
    const normalizedPostId = app.normalizePostUrl(postId);
    await app.loadShownCommentCooldowns();
    shownCommentCooldowns.add(normalizedPostId);

    const serialized = {};
    shownCommentCooldowns.forEach((value) => {
      serialized[value] = true;
    });

    return new Promise((resolve) => {
      chrome.storage.local.set(
        { [SHOWN_COMMENT_COOLDOWNS_KEY]: serialized },
        () => resolve(),
      );
    });
  };
})();
