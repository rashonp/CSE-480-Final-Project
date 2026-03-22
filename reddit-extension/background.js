(() => {
  const BACKEND_URL = "http://127.0.0.1:8787/analyze-arousal";

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
    if (message?.type !== "reddit-emotion-arousal-analysis") {
      return false;
    }

    postJson(BACKEND_URL, { text: String(message.text || "") })
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
