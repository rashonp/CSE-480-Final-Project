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
      meaning: "Something unexpected happened while overall safety still feels intact.",
      need: "Pause, orient, and re-establish your sense of safety.",
    },
    love: {
      emotion: "LOVE",
      meaning: "You feel connection, care, and closeness with someone or something.",
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
    guideHeader.className = "reddit-arousal-guide-row reddit-arousal-guide-header";

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
    continueToPostBtn.textContent = "Continue to Post";

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
          "Before opening the post, write one small first step that supports your unmet need.";
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
      "Pause to identify what you're feeling, what it means, and what you need before continuing.";
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
    row.className = "reddit-toxicity-row";

    const toxicityBadge = document.createElement("span");
    toxicityBadge.className = "reddit-toxicity-badge pending";
    toxicityBadge.textContent = "Toxicity: analyzing...";

    const arousalBadge = document.createElement("span");
    arousalBadge.className = "reddit-arousal-badge pending";
    arousalBadge.textContent = "Arousal: analyzing...";

    row.appendChild(toxicityBadge);
    row.appendChild(arousalBadge);
    return { row, toxicityBadge, arousalBadge };
  };

  app.isLikelyPostNavigationClick = (post, event) => {
    const target = event.target;
    if (!(target instanceof Element)) return false;

    if (target.closest(".reddit-sentiment-panel")) return false;

    const anchor = target.closest("a[href]");
    if (!anchor) return false;

    const href = anchor.getAttribute("href") || "";
    if (href.includes("/comments/")) return true;
    if (anchor.href && anchor.href.includes("/comments/")) return true;

    return post.contains(anchor);
  };

  app.getNavigationAnchorFromClick = (post, event) => {
    const target = event.target;
    if (!(target instanceof Element)) return null;

    if (target.closest(".reddit-sentiment-panel")) return null;

    const anchor = target.closest("a[href]");
    if (!anchor) return null;
    if (anchor.href && anchor.href.includes("/comments/")) return anchor;

    return post.contains(anchor) ? anchor : null;
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

  app.attachArousalClickGuard = (post, postId) => {
    if (post.dataset.arousalGuardAttached === "true") return;

    post.addEventListener("click", async (event) => {
      if (event.defaultPrevented) return;
      if (!app.isLikelyPostNavigationClick(post, event)) return;

      const anchor = app.getNavigationAnchorFromClick(post, event);
      if (!anchor?.href) return;

      const score = app.state.arousalCache.get(postId);
      if (typeof score !== "number" || score <= 0.5) return;

      event.preventDefault();
      event.stopPropagation();

      const percent = Math.round(score * 100);
      const currentEmotion = await app.loadEmotionAsync(postId);
      const { proceed, selectedEmotion } = await app.showArousalDialog(
        percent,
        currentEmotion,
      );

      if (!proceed) return;

      if (selectedEmotion) {
        app.saveEmotion(postId, selectedEmotion);
        app.applyEmotionSelectionToPost(post, selectedEmotion);
      }

      if (anchor.target === "_blank" || event.ctrlKey || event.metaKey) {
        window.open(anchor.href, "_blank", "noopener");
      } else {
        window.location.href = anchor.href;
      }
    });

    post.dataset.arousalGuardAttached = "true";
  };

  app.renderToxicity = async (post, postId, badge) => {
    const text = app.extractPostText(post);
    if (!text) {
      badge.className = "reddit-toxicity-badge error";
      badge.textContent = "Toxicity: n/a";
      return;
    }

    const score = await app.scorePost(postId, text);
    if (!badge.isConnected) return;

    const percent = Math.round(score * 100);
    badge.className = `reddit-toxicity-badge ${app.getScoreClass(score)}`;
    badge.textContent = `Toxicity: ${percent}%`;
  };

  app.renderArousal = async (post, postId, badge) => {
    const text = app.extractPostText(post);
    if (!text) {
      badge.className = "reddit-arousal-badge error";
      badge.textContent = "Arousal: n/a";
      return;
    }

    let score = app.state.arousalCache.get(postId);
    if (typeof score !== "number") {
      score = await app.computeArousalScore(post, postId, text);
      app.state.arousalCache.set(postId, score);
    }

    if (!badge.isConnected) return;

    const percent = Math.round(score * 100);
    badge.className = `reddit-arousal-badge ${app.getScoreClass(score)}`;
    badge.textContent = `Arousal: ${percent}%`;
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

    posts.forEach((post) => {
      const postId = app.getPostId(post);
      if (!postId) return;

      app.attachArousalClickGuard(post, postId);

      if (post.querySelector(".reddit-sentiment-panel")) return;

      const panel = document.createElement("div");
      panel.className = "reddit-sentiment-panel";

      const { row, toxicityBadge, arousalBadge } = app.createSignalRow();
      const emotions = app.createEmotionBar(postId);
      panel.appendChild(row);
      panel.appendChild(emotions);

      const footer = post.querySelector("footer");
      if (footer) {
        footer.insertAdjacentElement("afterend", panel);
      } else {
        post.appendChild(panel);
      }

      app.renderToxicity(post, postId, toxicityBadge);
      app.renderArousal(post, postId, arousalBadge);
    });
  };
})();
