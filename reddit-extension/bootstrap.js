(() => {
  const app = window.RedditEmotionExt;
  if (!app?.injectIntoPosts) return;

  const start = () => {
    const observer = new MutationObserver(() => app.injectIntoPosts());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    app.injectIntoPosts();
  };

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
