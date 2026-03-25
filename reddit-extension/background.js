(() => {
  const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8787";
  const INSTALL_TOKEN_KEY = "installToken";
  const BACKEND_BASE_URL_KEY = "backendBaseUrl";
  const BACKEND_ROUTES = {
    "reddit-emotion-arousal-analysis": {
      method: "POST",
      path: "/analyze-arousal",
    },
    "reddit-emotion-profile-summary": {
      method: "POST",
      path: "/summarize-reflection",
    },
    "reddit-emotion-load-profile-data": {
      method: "POST",
      path: "/profile-data",
    },
    "reddit-emotion-save-profile-settings": {
      method: "POST",
      path: "/profile-settings",
    },
    "reddit-emotion-delete-profile-entry": {
      method: "POST",
      path: "/profile-delete-entry",
    },
    "reddit-emotion-clear-profile-data": {
      method: "POST",
      path: "/profile-clear-data",
    },
  };

  const getLocal = (keys) =>
    new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });

  const setLocal = (values) =>
    new Promise((resolve) => {
      chrome.storage.local.set(values, () => resolve());
    });

  const getBackendBaseUrl = async () => {
    const result = await getLocal([BACKEND_BASE_URL_KEY]);
    const configured = String(result?.[BACKEND_BASE_URL_KEY] || "").trim();
    return (configured || DEFAULT_BACKEND_BASE_URL).replace(/\/+$/, "");
  };

  const getOrCreateInstallToken = async () => {
    const result = await getLocal([INSTALL_TOKEN_KEY]);
    const existing = String(result?.[INSTALL_TOKEN_KEY] || "").trim();
    if (existing) return existing;

    const token = crypto.randomUUID();
    await setLocal({ [INSTALL_TOKEN_KEY]: token });
    return token;
  };

  const requestJson = async (route, payload) => {
    const baseUrl = await getBackendBaseUrl();
    const installToken = await getOrCreateInstallToken();
    const response = await fetch(`${baseUrl}${route.path}`, {
      method: route.method || "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(payload || {}),
        install_token: installToken,
      }),
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

    const route = BACKEND_ROUTES[message?.type];
    if (!route) {
      return false;
    }

    requestJson(route, message.payload || { text: String(message.text || "") })
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
