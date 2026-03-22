(() => {
  const app = window.RedditEmotionExt;
  if (!app) return;

  const { EMOTIONS } = app.constants;
  const EMOTION_GUIDANCE = {
    angry: {
      emotion: "ANGER",
      meaning:
        "Something feels unfair. A boundary is being crossed or an offense feels personal.",
      need: "Set a boundary. Defend your values with assertiveness.",
    },
    happy: {
      emotion: "HAPPINESS",
      meaning:
        "You are making progress toward something meaningful and it feels good.",
      need: "Celebrate it. Savor the moment and keep going.",
    },
    sad: {
      emotion: "SADNESS",
      meaning:
        "A loss is present, or something important is missing and being grieved.",
      need: "Soothing and comfort. Space to process what matters.",
    },
    surprised: {
      emotion: "SURPRISE",
      meaning:
        "Something unexpected happened while overall safety still feels intact.",
      need: "Pause, orient, and re-establish your sense of safety.",
    },
    love: {
      emotion: "LOVE",
      meaning:
        "You feel connection, care, and closeness with someone or something.",
      need: "Nurture the bond. Express appreciation and stay connected.",
    },
    default: {
      emotion: "EMOTION",
      meaning: "Name what you feel before continuing.",
      need: "Choose the support or action you need right now.",
    },
  };

  const getEmotionGuidance = (emotionKey) =>
    EMOTION_GUIDANCE[emotionKey] || EMOTION_GUIDANCE.default;

  const formatPercent = (value) =>
    typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a";

  const COMMENT_ACTION_PATTERN =
    /reply|comment|add a comment|leave a comment|join the conversation|content creation input/i;

  app.closeArousalDialog = (result) => {
    const dialog = app.state.arousalDialogState;
    if (!dialog) return;

    const { overlay, input, reappraisalInput, resolver } = dialog;
    if (typeof resolver === "function") {
      resolver({
        ...result,
        selectedEmotion: dialog.selectedEmotion,
        checkInNote: input.value.trim(),
        reappraisalStep: reappraisalInput.value.trim(),
      });
    }

    overlay.classList.remove("visible");
    input.value = "";
    reappraisalInput.value = "";
    dialog.selectedEmotion = null;
    dialog.emotionButtons.forEach((btn) => btn.classList.remove("active"));
    dialog.updateGuidance?.(null);
    dialog.setStep?.("checkin");
    dialog.resolver = null;
  };

  app.ensureArousalDialog = () => {
    if (app.state.arousalDialogState) {
      return app.state.arousalDialogState;
    }

    const overlay = document.createElement("div");
    overlay.className = "reddit-arousal-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "reddit-arousal-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    const title = document.createElement("h3");
    title.className = "reddit-arousal-modal-title";
    title.textContent = "Emotion Check-In";

    const message = document.createElement("p");
    message.className = "reddit-arousal-modal-message";

    const checkInSection = document.createElement("div");
    checkInSection.className = "reddit-arousal-modal-section";

    const emotionLabel = document.createElement("label");
    emotionLabel.className = "reddit-arousal-modal-label";
    emotionLabel.textContent = "Select emotion";

    const emotionPicker = document.createElement("div");
    emotionPicker.className = "reddit-arousal-modal-emotion-picker";

    const guide = document.createElement("div");
    guide.className = "reddit-arousal-guide";

    const guideHeader = document.createElement("div");
    guideHeader.className =
      "reddit-arousal-guide-row reddit-arousal-guide-header";

    const guideHeaderEmotion = document.createElement("div");
    guideHeaderEmotion.className = "reddit-arousal-guide-cell is-header";
    guideHeaderEmotion.textContent = "Emotion";

    const guideHeaderMeaning = document.createElement("div");
    guideHeaderMeaning.className = "reddit-arousal-guide-cell is-header";
    guideHeaderMeaning.textContent = "Meaning";

    const guideHeaderNeed = document.createElement("div");
    guideHeaderNeed.className = "reddit-arousal-guide-cell is-header";
    guideHeaderNeed.textContent = "Need";

    guideHeader.appendChild(guideHeaderEmotion);
    guideHeader.appendChild(guideHeaderMeaning);
    guideHeader.appendChild(guideHeaderNeed);

    const guideBody = document.createElement("div");
    guideBody.className = "reddit-arousal-guide-row";

    const guideEmotion = document.createElement("div");
    guideEmotion.className = "reddit-arousal-guide-cell";

    const guideMeaning = document.createElement("div");
    guideMeaning.className = "reddit-arousal-guide-cell";

    const guideNeed = document.createElement("div");
    guideNeed.className = "reddit-arousal-guide-cell";

    guideBody.appendChild(guideEmotion);
    guideBody.appendChild(guideMeaning);
    guideBody.appendChild(guideNeed);
    guide.appendChild(guideHeader);
    guide.appendChild(guideBody);

    const inputLabel = document.createElement("label");
    inputLabel.className = "reddit-arousal-modal-label";
    inputLabel.textContent = "Optional note";

    const input = document.createElement("textarea");
    input.className = "reddit-arousal-modal-input";
    input.rows = 3;
    input.placeholder = "Add any quick reflection before deciding...";

    checkInSection.appendChild(emotionLabel);
    checkInSection.appendChild(emotionPicker);
    checkInSection.appendChild(guide);
    checkInSection.appendChild(inputLabel);
    checkInSection.appendChild(input);

    const reappraisalSection = document.createElement("div");
    reappraisalSection.className = "reddit-arousal-modal-section";
    reappraisalSection.hidden = true;

    const reappraisalTitle = document.createElement("p");
    reappraisalTitle.className = "reddit-arousal-reappraisal-title";
    reappraisalTitle.textContent = "Cognitive Reappraisal";

    const reappraisalLead = document.createElement("p");
    reappraisalLead.className = "reddit-arousal-reappraisal-text";
    reappraisalLead.textContent =
      "This emotion can signal an unmet need. Name one action that moves you 1% closer to meeting that need.";

    const reappraisalNeed = document.createElement("p");
    reappraisalNeed.className = "reddit-arousal-reappraisal-need";

    const reappraisalLabel = document.createElement("label");
    reappraisalLabel.className = "reddit-arousal-modal-label";
    reappraisalLabel.textContent = "Your 1% step (online or offline)";

    const reappraisalInput = document.createElement("textarea");
    reappraisalInput.className = "reddit-arousal-modal-input";
    reappraisalInput.rows = 3;
    reappraisalInput.placeholder =
      "Example: Mute this thread, text a friend, or take a 2-minute walk.";

    reappraisalSection.appendChild(reappraisalTitle);
    reappraisalSection.appendChild(reappraisalLead);
    reappraisalSection.appendChild(reappraisalNeed);
    reappraisalSection.appendChild(reappraisalLabel);
    reappraisalSection.appendChild(reappraisalInput);

    const updateGuidance = (emotionKey) => {
      const guidance = getEmotionGuidance(emotionKey);
      guideEmotion.textContent = guidance.emotion;
      guideMeaning.textContent = guidance.meaning;
      guideNeed.textContent = guidance.need;
      reappraisalNeed.textContent = `Unmet need signal: ${guidance.need}`;
      guideBody.classList.toggle("is-active", Boolean(emotionKey));
    };

    const emotionButtons = [];
    EMOTIONS.forEach((emotion) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reddit-arousal-modal-emotion-btn";
      button.textContent = emotion.label;
      button.dataset.emotionKey = emotion.key;

      button.addEventListener("click", () => {
        const dialog = app.state.arousalDialogState;
        if (!dialog) return;

        const nextValue =
          dialog.selectedEmotion === emotion.key ? null : emotion.key;

        dialog.selectedEmotion = nextValue;
        emotionButtons.forEach((btn) => {
          const isActive = btn.dataset.emotionKey === nextValue;
          btn.classList.toggle("active", isActive);
        });
        updateGuidance(nextValue);
      });

      emotionButtons.push(button);
      emotionPicker.appendChild(button);
    });

    const actions = document.createElement("div");
    actions.className = "reddit-arousal-modal-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "reddit-arousal-modal-btn secondary";
    cancelBtn.textContent = "Cancel";

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "reddit-arousal-modal-btn neutral";
    skipBtn.textContent = "Skip";

    const continueBtn = document.createElement("button");
    continueBtn.type = "button";
    continueBtn.className = "reddit-arousal-modal-btn primary";
    continueBtn.textContent = "Continue";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "reddit-arousal-modal-btn secondary";
    backBtn.textContent = "Back";

    const continueToPostBtn = document.createElement("button");
    continueToPostBtn.type = "button";
    continueToPostBtn.className = "reddit-arousal-modal-btn primary";
    continueToPostBtn.textContent = "Continue to Comment";

    const setStep = (step) => {
      const inCheckIn = step === "checkin";
      checkInSection.hidden = !inCheckIn;
      reappraisalSection.hidden = inCheckIn;
      skipBtn.hidden = !inCheckIn;
      continueBtn.hidden = !inCheckIn;

      if (inCheckIn) {
        if (backBtn.isConnected) {
          actions.removeChild(backBtn);
        }
        if (continueToPostBtn.isConnected) {
          actions.removeChild(continueToPostBtn);
        }
      } else {
        if (!backBtn.isConnected) {
          actions.appendChild(backBtn);
        }
        if (!continueToPostBtn.isConnected) {
          actions.appendChild(continueToPostBtn);
        }
      }

      if (inCheckIn) {
        message.textContent =
          modal.dataset.checkinMessage ||
          "Pause to identify what you're feeling before deciding.";
      } else {
        message.textContent =
          "Before commenting, write one small first step that supports your unmet need.";
      }
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(skipBtn);
    actions.appendChild(continueBtn);

    modal.appendChild(title);
    modal.appendChild(message);
    modal.appendChild(checkInSection);
    modal.appendChild(reappraisalSection);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    updateGuidance(null);
    setStep("checkin");

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        app.closeArousalDialog({ proceed: false, action: "cancel" });
      }
    });

    cancelBtn.addEventListener("click", () => {
      app.closeArousalDialog({ proceed: false, action: "cancel" });
    });

    skipBtn.addEventListener("click", () => {
      app.closeArousalDialog({ proceed: true, action: "skip" });
    });

    continueBtn.addEventListener("click", () => {
      setStep("reappraisal");
      requestAnimationFrame(() => {
        reappraisalInput.focus();
      });
    });

    backBtn.addEventListener("click", () => {
      setStep("checkin");
      requestAnimationFrame(() => {
        input.focus();
      });
    });

    continueToPostBtn.addEventListener("click", () => {
      app.closeArousalDialog({ proceed: true, action: "continue" });
    });

    document.addEventListener("keydown", (event) => {
      const dialog = app.state.arousalDialogState;
      if (!dialog?.resolver) return;
      if (event.key !== "Escape") return;

      event.preventDefault();
      app.closeArousalDialog({ proceed: false, action: "cancel" });
    });

    app.state.arousalDialogState = {
      overlay,
      modal,
      message,
      input,
      reappraisalInput,
      emotionButtons,
      updateGuidance,
      setStep,
      selectedEmotion: null,
      resolver: null,
    };

    return app.state.arousalDialogState;
  };

  app.showArousalDialog = (percent, preselectedEmotion = null) => {
    const dialog = app.ensureArousalDialog();
    if (dialog.resolver) {
      return Promise.resolve({
        proceed: false,
        action: "busy",
        selectedEmotion: null,
      });
    }

    dialog.modal.dataset.checkinMessage =
      `This post has a high arousal score (${percent}%). ` +
      "Pause to identify what you're feeling, what it means, and what you need before commenting.";
    dialog.message.textContent = dialog.modal.dataset.checkinMessage;
    dialog.overlay.classList.add("visible");
    dialog.selectedEmotion = preselectedEmotion;
    dialog.emotionButtons.forEach((btn) => {
      const isActive = btn.dataset.emotionKey === preselectedEmotion;
      btn.classList.toggle("active", isActive);
    });
    dialog.updateGuidance(preselectedEmotion);
    dialog.setStep("checkin");

    requestAnimationFrame(() => {
      dialog.input.focus();
    });

    return new Promise((resolve) => {
      dialog.resolver = resolve;
    });
  };

  app.createSignalRow = () => {
    const row = document.createElement("div");
    row.className = "reddit-signal-row";

    const arousalBadge = document.createElement("span");
    arousalBadge.className = "reddit-arousal-badge pending";
    arousalBadge.textContent = "Arousal: analyzing...";

    row.appendChild(arousalBadge);
    return { row, arousalBadge };
  };

  app.ensureArousalTooltip = (panel) => {
    let tooltip = panel.querySelector(".reddit-arousal-tooltip");
    if (tooltip) return tooltip;

    tooltip = document.createElement("div");
    tooltip.className = "reddit-arousal-tooltip";
    tooltip.hidden = true;
    panel.appendChild(tooltip);
    return tooltip;
  };

  app.renderArousalTooltip = (post, panel, details) => {
    const tooltip = app.ensureArousalTooltip(panel);

    if (!details) {
      tooltip.hidden = true;
      tooltip.innerHTML = "";
      panel.dataset.hasArousalTooltip = "false";
      post.dataset.hasArousalTooltip = "false";
      return;
    }

    const llmStatus = details.llmLabel
      ? `${formatPercent(details.llmScore)} (${details.llmLabel})`
      : formatPercent(details.llmScore);

    const lines = [
      `<div class="reddit-arousal-tooltip-title">Arousal Breakdown</div>`,
      `<div class="reddit-arousal-tooltip-section">Final Score</div>`,
      `<div class="reddit-arousal-tooltip-line is-final"><span>Final</span><strong>${formatPercent(details.finalScore)}</strong></div>`,
      `<div class="reddit-arousal-tooltip-divider"></div>`,
      `<div class="reddit-arousal-tooltip-section">Components</div>`,
      `<div class="reddit-arousal-tooltip-line"><span>Base</span><strong>${formatPercent(details.heuristicScore)}</strong></div>`,
      `<div class="reddit-arousal-tooltip-line"><span>LLM</span><strong>${llmStatus}</strong></div>`,
    ];

    if (details.primaryEmotion) {
      lines.push(
        `<div class="reddit-arousal-tooltip-meta">Primary emotion: ${details.primaryEmotion}</div>`,
      );
    }

    if (details.llmReason) {
      lines.push(
        `<div class="reddit-arousal-tooltip-reason">${details.llmReason}</div>`,
      );
    }

    tooltip.innerHTML = lines.join("");
    tooltip.hidden = false;
    panel.dataset.hasArousalTooltip = "true";
    post.dataset.hasArousalTooltip = "true";
  };

  app.getEventPathElements = (event) => {
    const path =
      typeof event?.composedPath === "function" ? event.composedPath() : [];
    const elements = path.filter((node) => node instanceof Element);
    if (elements.length > 0) return elements;

    return event?.target instanceof Element ? [event.target] : [];
  };

  app.getCommentIntent = (event) => {
    const elements = app.getEventPathElements(event);
    if (elements.length === 0) return null;

    for (const element of elements) {
      if (
        element.closest(".reddit-sentiment-panel") ||
        element.closest(".reddit-arousal-modal-overlay")
      ) {
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

      const label = [
        action.getAttribute("aria-label"),
        action.getAttribute("data-testid"),
        action.getAttribute("title"),
        action.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

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

    const postId =
      app.getPostId(pagePost) || app.normalizePostUrl(window.location.href);
    if (!postId) return null;

    return { post: pagePost, postId };
  };

  app.ensureArousalDetails = async (post, postId) => {
    let details = app.state.arousalCache.get(postId);
    if (details && typeof details.finalScore === "number") {
      return details;
    }

    const text = app.extractPostText(post);
    if (!text) return null;

    details = await app.computeArousalDetails(post, postId, text);
    app.state.arousalCache.set(postId, details);

    const badge = post.querySelector(".reddit-arousal-badge");
    const panel = post.querySelector(".reddit-sentiment-panel");
    if (badge && panel) {
      const percent = Math.round(details.finalScore * 100);
      badge.className = `reddit-arousal-badge ${app.getScoreClass(details.finalScore)}`;
      badge.textContent = `Arousal: ${percent}%`;
      app.renderArousalTooltip(post, panel, details);
    }

    return details;
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

  app.handleCommentGuardEvent = async (event) => {
    const intent = app.getCommentIntent(event);
    if (!intent) return;

    const context = app.getCommentGuardContext(event);
    if (!context?.post || !context?.postId) return;

    if (!intent?.element) return;

    const { post, postId } = context;

    if (app.state.commentGuardBypassTargets.has(intent.element)) {
      app.state.commentGuardBypassTargets.delete(intent.element);
      return;
    }

    if (app.state.commentGuardActivePostIds.has(postId)) {
      app.blockCommentEvent(event, intent);
      return;
    }

    const details = await app.ensureArousalDetails(post, postId);
    const score = details?.finalScore;
    if (typeof score !== "number" || score <= 0.1) return;
    if (await app.hasShownArousalPrompt(postId)) return;

    app.blockCommentEvent(event, intent);
    app.state.commentGuardActivePostIds.add(postId);

    try {
      const percent = Math.round(score * 100);
      const currentEmotion = await app.loadEmotionAsync(postId);
      const { proceed, selectedEmotion } = await app.showArousalDialog(
        percent,
        currentEmotion,
      );

      if (proceed) {
        await app.markArousalPromptShown(postId);
      }

      if (!proceed) return;

      if (selectedEmotion) {
        app.saveEmotion(postId, selectedEmotion);
        app.applyEmotionSelectionToPost(post, selectedEmotion);
      }

      app.resumeCommentIntent(intent);
    } finally {
      app.state.commentGuardActivePostIds.delete(postId);
    }
  };

  app.applyEmotionSelectionToPost = (post, emotionKey) => {
    const emotionBar = post.querySelector(".reddit-emotion-bar");
    if (!emotionBar) return;

    emotionBar.querySelectorAll(".reddit-emotion-btn").forEach((button) => {
      const isActive =
        button.textContent?.trim().toLowerCase() === emotionKey?.toLowerCase();
      button.classList.toggle("active", Boolean(isActive));
    });
  };

  app.attachGlobalArousalCommentGuard = () => {
    if (document.body?.dataset.arousalCommentGuardAttached === "true") return;

    document.addEventListener(
      "pointerdown",
      async (event) => {
        if (event.defaultPrevented) return;
        await app.handleCommentGuardEvent(event);
      },
      true,
    );

    document.addEventListener(
      "click",
      async (event) => {
        if (event.defaultPrevented) return;
        await app.handleCommentGuardEvent(event);
      },
      true,
    );

    document.body.dataset.arousalCommentGuardAttached = "true";
  };

  app.renderArousal = async (post, postId, badge, panel) => {
    const text = app.extractPostText(post);
    if (!text) {
      badge.className = "reddit-arousal-badge error";
      badge.textContent = "Arousal: n/a";
      app.renderArousalTooltip(post, panel, null);
      return;
    }

    let details = app.state.arousalCache.get(postId);
    if (!details || typeof details.finalScore !== "number") {
      details = await app.computeArousalDetails(post, postId, text);
      app.state.arousalCache.set(postId, details);
    }

    if (!badge.isConnected) return;

    const percent = Math.round(details.finalScore * 100);
    badge.className = `reddit-arousal-badge ${app.getScoreClass(details.finalScore)}`;
    badge.textContent = `Arousal: ${percent}%`;
    app.renderArousalTooltip(post, panel, details);
  };

  app.createEmotionBar = (postId) => {
    const bar = document.createElement("div");
    bar.className = "reddit-emotion-bar";

    [
      "click",
      "auxclick",
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "touchstart",
      "touchend",
    ].forEach((eventName) => {
      bar.addEventListener(eventName, app.stopBubble);
    });

    EMOTIONS.forEach((emotion) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reddit-emotion-btn";
      btn.textContent = emotion.label;

      btn.addEventListener("click", (event) => {
        app.blockNavigation(event);
        app.saveEmotion(postId, emotion.key);

        bar
          .querySelectorAll(".reddit-emotion-btn")
          .forEach((button) => button.classList.remove("active"));
        btn.classList.add("active");
      });

      [
        "pointerdown",
        "pointerup",
        "mousedown",
        "mouseup",
        "touchstart",
        "touchend",
      ].forEach((eventName) => {
        btn.addEventListener(eventName, app.stopBubble);
      });

      app.loadEmotion(postId, (saved) => {
        if (saved === emotion.key) {
          btn.classList.add("active");
        }
      });

      bar.appendChild(btn);
    });

    return bar;
  };

  app.injectIntoPosts = () => {
    const posts = document.querySelectorAll("shreddit-post");
    app.attachGlobalArousalCommentGuard();

    posts.forEach((post) => {
      const postId = app.getPostId(post);
      if (!postId) return;

      if (post.querySelector(".reddit-sentiment-panel")) return;

      const panel = document.createElement("div");
      panel.className = "reddit-sentiment-panel";

      const { row, arousalBadge } = app.createSignalRow();
      const emotions = app.createEmotionBar(postId);
      panel.appendChild(row);
      panel.appendChild(emotions);

      const footer = post.querySelector("footer");
      if (footer) {
        footer.insertAdjacentElement("afterend", panel);
      } else {
        post.appendChild(panel);
      }

      app.renderArousal(post, postId, arousalBadge, panel);
    });
  };
})();
