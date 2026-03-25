(() => {
  const BACKEND_URLS = {
    "reddit-emotion-arousal-analysis": "http://127.0.0.1:8787/analyze-arousal",
    "reddit-emotion-profile-summary":
      "http://127.0.0.1:8787/summarize-reflection",
  };

  const postJson = async (url, payload) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }
    }

    if (!response.ok) {
      const message =
        data?.error || `backend-request-failed-${response.status}`;
      throw new Error(message);
    }

    return data;
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "reddit-emotion-open-profile-page") {
      chrome.tabs
        .create({
          url: chrome.runtime.getURL("profile.html"),
        })
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((error) => {
          console.warn("Could not open profile page.", error);
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return true;
    }

    const endpoint = BACKEND_URLS[message?.type];
    if (!endpoint) {
      return false;
    }

    postJson(endpoint, message.payload || { text: String(message.text || "") })
      .then((data) => {
        sendResponse({ ok: true, data });
      })
      .catch((error) => {
        console.warn("Arousal LLM backend request failed.", error);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  });
})();
