(() => {
  const app = window.RedditBaselineExt;
  if (!app) return;

  const COMMENT_ACTION_PATTERN =
    /reply|comment|add a comment|leave a comment|join the conversation|content creation input/i;
  const COMMENT_SUBMIT_PATTERN = /\b(comment|reply)\b/i;
  const RECENT_COMMENT_CAPTURE_TTL_MS = 15 * 1000;

  app.getEventPathElements = (event) => {
    const path =
      typeof event?.composedPath === "function" ? event.composedPath() : [];
    const elements = path.filter((node) => node instanceof Element);
    if (elements.length > 0) return elements;

    return event?.target instanceof Element ? [event.target] : [];
  };

  app.getActionLabel = (action) =>
    [
      action?.getAttribute?.("aria-label"),
      action?.getAttribute?.("data-testid"),
      action?.getAttribute?.("title"),
      action?.textContent,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  app.getPostId = (post) => {
    const link = post?.querySelector?.('a[href*="/comments/"]');
    if (link?.href) {
      return app.normalizePostUrl(link.href);
    }

    const pathMatch = window.location.pathname.match(/\/comments\/([a-z0-9]+)\//i);
    if (pathMatch && document.querySelectorAll("shreddit-post").length === 1) {
      return app.normalizePostUrl(window.location.href);
    }

    return "";
  };

  app.getCommentComposer = (element) => {
    if (!element?.closest) return null;

    const composer = element.closest(
      "shreddit-comment-composer, shreddit-composer, shreddit-simple-composer, faceplate-form, form",
    );
    if (!composer) return null;

    const field = composer.matches(
      'textarea, [contenteditable="true"], [role="textbox"], [name="content"]',
    )
      ? composer
      : composer.querySelector(
          'textarea, [contenteditable="true"], [role="textbox"], [name="content"]',
        );

    return field ? composer : null;
  };

  app.findCommentComposerFromElements = (elements) => {
    for (const element of elements) {
      const composer = app.getCommentComposer(element);
      if (composer) return composer;
    }

    return null;
  };

  app.sanitizeComposerText = (value) =>
    String(value || "")
      .replace(/\s*cancel\s+(comment|reply)\s*$/i, "")
      .trim();

  app.extractComposerText = (composer) => {
    if (!composer) return "";

    const fields = composer.matches(
      'textarea, [contenteditable="true"], [role="textbox"], [name="content"]',
    )
      ? [composer]
      : Array.from(
          composer.querySelectorAll(
            'textarea, [contenteditable="true"], [role="textbox"], [name="content"]',
          ),
        );

    const values = fields
      .map((field) => {
        if ("value" in field && typeof field.value === "string") {
          return app.sanitizeComposerText(field.value);
        }

        return app.sanitizeComposerText(
          field.innerText?.trim() || field.textContent?.trim() || "",
        );
      })
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);

    return values[0] || "";
  };

  app.extractCommentText = (comment) => {
    if (!comment) return "";

    const snippets = [];
    [
      '[slot="comment"]',
      '[slot="comment-body"]',
      '[data-testid="comment"]',
      "p",
      "li",
    ].forEach((selector) => {
      comment.querySelectorAll(selector).forEach((node) => {
        const value = node.textContent?.trim() || "";
        if (value) snippets.push(value);
      });
    });

    return Array.from(new Set(snippets))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, app.constants.MAX_TEXT_LENGTH);
  };

  app.getCommentId = (comment) => {
    if (!comment) return "";

    const permalink =
      comment.querySelector?.('a[href*="/comments/"]')?.href ||
      comment.getAttribute?.("permalink") ||
      comment.getAttribute?.("comment-permalink") ||
      comment.getAttribute?.("data-permalink") ||
      "";
    if (permalink) {
      try {
        const absolute = new URL(permalink, window.location.origin).href;
        const match = absolute.match(/\/comments\/[a-z0-9]+\/[^/]*\/([a-z0-9]+)\//i);
        if (match) return match[1].toLowerCase();
      } catch {
        // Ignore malformed URLs in unknown attributes.
      }
    }

    const rawId =
      comment.getAttribute?.("thingid") ||
      comment.getAttribute?.("data-fullname") ||
      comment.getAttribute?.("fullname") ||
      comment.getAttribute?.("id") ||
      comment.id ||
      "";
    const normalizedId = String(rawId).trim().toLowerCase();
    return normalizedId.startsWith("t1_") ? normalizedId.slice(3) : normalizedId;
  };

  app.requestCommentActivitySave = (payload) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "reddit-emotion-save-comment-activity",
          payload,
        },
        (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }

          if (!response?.ok) {
            reject(
              new Error(response?.error || "comment-activity-request-failed"),
            );
            return;
          }

          resolve(response.data || {});
        },
      );
    });

  app.rememberRecentCommentCapture = (payload) => {
    const now = Date.now();
    app.state.recentCommentCaptureKeys.forEach((timestamp, key) => {
      if (now - timestamp > RECENT_COMMENT_CAPTURE_TTL_MS) {
        app.state.recentCommentCaptureKeys.delete(key);
      }
    });

    const key = app.hashString(
      [
        payload.post_id,
        payload.comment_kind,
        payload.parent_comment_id || "",
        payload.comment_text,
      ].join("::"),
    );

    const lastSeen = app.state.recentCommentCaptureKeys.get(key) || 0;
    if (now - lastSeen <= RECENT_COMMENT_CAPTURE_TTL_MS) {
      return "";
    }

    app.state.recentCommentCaptureKeys.set(key, now);
    return key;
  };

  app.getCommentSubmissionPayload = (event) => {
    const elements = app.getEventPathElements(event);
    if (elements.length === 0) return null;

    for (const element of elements) {
      if (element.closest(".baseline-countdown-overlay")) {
        return null;
      }
    }

    let action = null;
    for (const element of elements) {
      const candidate = element.closest?.('button, [role="button"], a[href]');
      if (!candidate) continue;

      const label = app.getActionLabel(candidate);
      if (!COMMENT_SUBMIT_PATTERN.test(label)) continue;

      action = candidate;
      break;
    }

    if (!action) return null;

    const composer =
      app.getCommentComposer(action) || app.findCommentComposerFromElements(elements);
    if (!composer) return null;

    const commentText = app.extractComposerText(composer);
    if (!commentText) return null;

    const context = app.getCommentGuardContext(event);
    if (!context?.post || !context?.postId) return null;

    const parentComment =
      action.closest?.("shreddit-comment") ||
      composer.closest?.("shreddit-comment") ||
      null;

    return {
      post_id: context.postId,
      post_text: app.extractPostText(context.post),
      comment_text: commentText,
      comment_kind: parentComment ? "reply" : "comment",
      parent_comment_id: app.getCommentId(parentComment) || "",
      parent_comment_text: app.extractCommentText(parentComment) || "",
    };
  };

  app.captureCommentSubmission = async (event) => {
    const payload = app.getCommentSubmissionPayload(event);
    if (!payload) return;

    const key = app.rememberRecentCommentCapture(payload);
    if (!key) return;

    try {
      await app.requestCommentActivitySave(payload);
    } catch (error) {
      app.state.recentCommentCaptureKeys.delete(key);
      console.warn("Could not save comment activity.", error);
    }
  };

  app.getCommentIntent = (event) => {
    const elements = app.getEventPathElements(event);
    if (elements.length === 0) return null;

    for (const element of elements) {
      if (element.closest(".baseline-countdown-overlay")) {
        return null;
      }
    }

    for (const element of elements) {
      const isComposerHost =
        element.matches?.("shreddit-simple-composer") ||
        element.closest?.("shreddit-simple-composer");
      const looksLikeTextbox =
        element.matches?.(
          'textarea, [contenteditable="true"], [role="textbox"], [name="content"]',
        ) ||
        element.matches?.(
          '[placeholder*="conversation" i], [placeholder*="comment" i], [aria-placeholder*="conversation" i], [aria-placeholder*="comment" i], [aria-label*="content creation input" i]',
        );

      if (isComposerHost || looksLikeTextbox) {
        return {
          kind: "composer",
          element: isComposerHost
            ? element.closest("shreddit-simple-composer") || element
            : element,
        };
      }
    }

    for (const element of elements) {
      const action = element.closest?.('button, [role="button"], a[href]');
      if (!action) continue;

      const label = app.getActionLabel(action);
      if (!COMMENT_ACTION_PATTERN.test(label)) continue;

      return {
        kind: "reply",
        element: action,
      };
    }

    return null;
  };

  app.getCommentGuardContext = (event) => {
    const elements = app.getEventPathElements(event);

    for (const element of elements) {
      const containingPost = element.closest?.("shreddit-post");
      if (!containingPost) continue;

      const postId = app.getPostId(containingPost);
      if (postId) return { post: containingPost, postId };
    }

    const pagePost = document.querySelector("shreddit-post");
    if (!pagePost) return null;

    const postId = app.getPostId(pagePost) || app.normalizePostUrl(window.location.href);
    if (!postId) return null;

    return { post: pagePost, postId };
  };

  app.blockCommentEvent = (event, intent) => {
    if (event.cancelable) {
      event.preventDefault();
    }
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
    if (
      intent.kind === "composer" &&
      typeof intent.element.blur === "function"
    ) {
      intent.element.blur();
    }
  };

  app.resumeCommentIntent = (intent) => {
    if (!intent?.element?.isConnected) return;

    app.state.commentGuardBypassTargets.add(intent.element);

    requestAnimationFrame(() => {
      if (!intent.element.isConnected) return;

      if (intent.kind === "composer") {
        if (typeof intent.element.click === "function") {
          intent.element.click();
        }
        if (typeof intent.element.focus === "function") {
          intent.element.focus();
        }
        return;
      }

      if (typeof intent.element.click === "function") {
        intent.element.click();
      }
    });
  };

  app.ensureCountdownDialog = () => {
    if (app.state.countdownDialogState) {
      return app.state.countdownDialogState;
    }

    const overlay = document.createElement("div");
    overlay.className = "baseline-countdown-overlay";

    const modal = document.createElement("div");
    modal.className = "baseline-countdown-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    const title = document.createElement("h2");
    title.className = "baseline-countdown-title";
    title.textContent = "Take A Minute";

    const body = document.createElement("p");
    body.className = "baseline-countdown-body";
    body.textContent =
      "Before commenting on this post for the first time, wait for the cooldown to finish.";

    const timer = document.createElement("div");
    timer.className = "baseline-countdown-timer";
    timer.textContent = "01:00";

    const actions = document.createElement("div");
    actions.className = "baseline-countdown-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "baseline-countdown-cancel";
    cancelBtn.textContent = "Cancel";

    const continueBtn = document.createElement("button");
    continueBtn.type = "button";
    continueBtn.className = "baseline-countdown-continue";
    continueBtn.textContent = "Continue";
    continueBtn.disabled = true;

    actions.appendChild(cancelBtn);
    actions.appendChild(continueBtn);
    modal.appendChild(title);
    modal.appendChild(body);
    modal.appendChild(timer);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    app.state.countdownDialogState = {
      overlay,
      timer,
      continueBtn,
      cancelBtn,
      countdownId: null,
      resolver: null,
    };

    cancelBtn.addEventListener("click", () => {
      const state = app.state.countdownDialogState;
      if (!state) return;
      if (state.countdownId) {
        clearInterval(state.countdownId);
        state.countdownId = null;
      }
      state.overlay.classList.remove("visible");
      state.continueBtn.disabled = true;
      const resolver = state.resolver;
      state.resolver = null;
      if (resolver) resolver(false);
    });

    continueBtn.addEventListener("click", () => {
      const state = app.state.countdownDialogState;
      if (!state || state.continueBtn.disabled) return;
      state.overlay.classList.remove("visible");
      const resolver = state.resolver;
      state.resolver = null;
      if (resolver) resolver(true);
    });

    return app.state.countdownDialogState;
  };

  app.showCountdownDialog = async () => {
    const dialog = app.ensureCountdownDialog();
    if (dialog.countdownId) {
      clearInterval(dialog.countdownId);
      dialog.countdownId = null;
    }

    dialog.overlay.classList.add("visible");
    dialog.continueBtn.disabled = true;
    dialog.timer.textContent = "01:00";

    return new Promise((resolve) => {
      let remaining = app.constants.COUNTDOWN_SECONDS;
      dialog.resolver = resolve;
      dialog.timer.textContent = `00:${String(remaining).padStart(2, "0")}`;

      dialog.countdownId = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(dialog.countdownId);
          dialog.countdownId = null;
          dialog.timer.textContent = "00:00";
          dialog.continueBtn.disabled = false;
          return;
        }

        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        dialog.timer.textContent = `${String(minutes).padStart(2, "0")}:${String(
          seconds,
        ).padStart(2, "0")}`;
      }, 1000);
    });
  };

  app.handleCommentCooldownEvent = async (event) => {
    const intent = app.getCommentIntent(event);
    if (!intent?.element) return;

    const context = app.getCommentGuardContext(event);
    if (!context?.postId) return;

    if (app.state.commentGuardBypassTargets.has(intent.element)) {
      app.state.commentGuardBypassTargets.delete(intent.element);
      return;
    }

    if (app.state.commentGuardActivePostIds.has(context.postId)) {
      app.blockCommentEvent(event, intent);
      return;
    }

    if (await app.hasShownCommentCooldown(context.postId)) return;

    app.blockCommentEvent(event, intent);
    app.state.commentGuardActivePostIds.add(context.postId);

    try {
      const proceed = await app.showCountdownDialog();
      if (!proceed) return;

      await app.markCommentCooldownShown(context.postId);
      app.resumeCommentIntent(intent);
    } finally {
      app.state.commentGuardActivePostIds.delete(context.postId);
    }
  };

  app.attachGlobalCommentCooldown = () => {
    if (document.body?.dataset.baselineCommentCooldownAttached === "true") {
      return;
    }

    document.addEventListener(
      "pointerdown",
      async (event) => {
        if (event.defaultPrevented) return;
        await app.handleCommentCooldownEvent(event);
      },
      true,
    );

    document.addEventListener(
      "click",
      async (event) => {
        if (event.defaultPrevented) return;
        await app.handleCommentCooldownEvent(event);
      },
      true,
    );

    document.body.dataset.baselineCommentCooldownAttached = "true";
  };

  app.attachCommentSubmissionCapture = () => {
    if (document.body?.dataset.baselineCommentCaptureAttached === "true") {
      return;
    }

    document.addEventListener(
      "click",
      (event) => {
        if (event.defaultPrevented) return;
        void app.captureCommentSubmission(event);
      },
      true,
    );

    document.body.dataset.baselineCommentCaptureAttached = "true";
  };

  app.injectIntoPosts = () => {
    app.attachGlobalCommentCooldown();
    app.attachCommentSubmissionCapture();
  };
})();
