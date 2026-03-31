(() => {
  console.log("Baseline countdown extension loaded");

  const app = (window.RedditBaselineExt = window.RedditBaselineExt || {});
  if (app.constants && app.state) return;

  app.constants = {
    MAX_TEXT_LENGTH: 2000,
    SHOWN_COMMENT_COOLDOWNS_KEY: "shownCommentCooldowns",
    COUNTDOWN_SECONDS: 3,
  };

  app.state = {
    shownCommentCooldowns: new Set(),
    shownCommentCooldownsLoadPromise: null,
    countdownDialogState: null,
    commentGuardBypassTargets: new WeakSet(),
    commentGuardActivePostIds: new Set(),
    recentCommentCaptureKeys: new Map(),
  };
})();
