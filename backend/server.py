import json
import os
import hashlib
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787
MODEL = "gpt-5-mini"
DEFAULT_POPUP_THRESHOLD = 0.1

PROMPT_TEMPLATE = """You are an emotion analysis system.

Task:
Given a Reddit post, estimate:
1. a generic emotional arousal level based only on the post text
2. a personalized emotional arousal level for this specific user

Definitions:
- Arousal = intensity of emotional activation (not positive vs negative).
- High arousal = anger, outrage, fear, panic, excitement, urgency.
- Low arousal = calm, neutral, reflective, informational.

Output:
Return a JSON object with:
{
  "generic_arousal_score": number from 0 to 1,
  "personalized_arousal_score": number from 0 to 1,
  "label": "low" | "medium" | "high",
  "primary_emotion": one of ["anger","fear","sadness","joy","neutral","other"],
  "generic_reason": short explanation (1 sentence),
  "personalized_reason": short explanation (1 sentence)
}

Guidelines:
- Focus on emotional intensity, not topic.
- Strong language, caps, urgency -> higher score.
- Neutral storytelling -> lower score.
- Write both reasons in plain, end-user-friendly language.
- Keep the reasons short, concrete, and easy to understand.
- Avoid technical or model-facing language like "the model infers", "classification", "context window", or "probability".
- Explain the score as if you are speaking directly to the user.
- The generic score should only use the post text.
- The personalized score is an additional personalization adjustment, not a second total score.
- The total LLM score should be interpreted as generic_arousal_score + personalized_arousal_score, clamped to 1.
- The personalized score should strongly use overlap with the user's prior labeled posts and user-reported triggers.
- Treat user-reported triggers as high-priority evidence. If the post clearly touches a listed trigger, assign a noticeable personalized_arousal_score even when the generic score is low or medium.
- Use prior labeled posts to infer recurring patterns in what tends to activate this user, especially repeated topics, social dynamics, or emotional themes.
- Personalized scoring rubric:
  - 0.00: no meaningful overlap with user-specific context
  - 0.00-0.25: weak or indirect overlap
  - 0.30-0.55: clear overlap with a trigger or prior pattern
  - 0.60-1.00: strong direct overlap with a major trigger or repeated high-intensity pattern
- If the personalization context is blank or unrelated, personalized_arousal_score should be 0.
- If user-reported triggers are blank, ignore them.
- If prior labeled post history is blank, ignore it.
- Do not assume the user always reacts strongly to related topics; only increase personalization when the overlap is concrete enough to explain briefly in personalized_reason.
- It is acceptable for personalized_arousal_score to be equal to or larger than generic_arousal_score when the user-specific match is strong.

User-reported triggers:
\"\"\"
__USER_REPORTED_TRIGGERS__
\"\"\"

Prior labeled post summaries:
\"\"\"
__PRIOR_LABELED_POSTS_SUMMARY__
\"\"\"

Text:
\"\"\"
__POST_TEXT__
\"\"\""""

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "generic_arousal_score": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
        },
        "personalized_arousal_score": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
        },
        "label": {
            "type": "string",
            "enum": ["low", "medium", "high"],
        },
        "primary_emotion": {
            "type": "string",
            "enum": ["anger", "fear", "sadness", "joy", "neutral", "other"],
        },
        "generic_reason": {
            "type": "string",
        },
        "personalized_reason": {
            "type": "string",
        },
    },
    "required": [
        "generic_arousal_score",
        "personalized_arousal_score",
        "label",
        "primary_emotion",
        "generic_reason",
        "personalized_reason",
    ],
}

PROFILE_SUMMARY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {
            "type": "string",
        },
    },
    "required": ["summary"],
}

PROFILE_SUMMARY_PROMPT = """You summarize Reddit reflections for a private profile page.

Task:
Write one short paragraph that summarizes:
- what the Reddit post is about
- what emotion the user selected
- the user's trigger intensity if provided
- any useful signal from the user's note
- any useful signal from the user's reappraisal step

Rules:
- Keep it under 80 words
- Be concrete and plain
- Write for an end user, not for an analyst or developer
- Use natural, supportive language without technical phrasing
- Do not quote the post
- Treat the Reddit post as content the user read, not as something the user wrote
- Do not describe the post using second person phrasing such as "you said", "you described", or "your post"
- Only use "you" for the user's selected emotion, trigger intensity, note, or reappraisal step
- If the note, trigger intensity, or reappraisal step is empty, ignore it

Selected emotion: __SELECTED_EMOTION__
Trigger intensity: __TRIGGER_INTENSITY__
Check-in note: __CHECK_IN_NOTE__
Reappraisal step: __REAPPRAISAL_STEP__

Post:
\"\"\"
__POST_TEXT__
\"\"\""""


def load_env_file():
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        cleaned = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), cleaned)


def get_api_key():
    load_env_file()
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")
    return api_key


def get_supabase_url():
    load_env_file()
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    if not url:
        raise RuntimeError("SUPABASE_URL is not configured.")
    return url


def get_supabase_service_role_key():
    load_env_file()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured.")
    return key


def hash_install_token(install_token):
    return hashlib.sha256(install_token.encode("utf-8")).hexdigest()


def parse_timestamp_millis(value):
    if not isinstance(value, str) or not value.strip():
        return 0

    try:
        return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return 0


def supabase_request(method, table, query=None, body=None, prefer=None):
    url = f"{get_supabase_url()}/rest/v1/{table}"
    if query:
        url = f"{url}?{urlencode(query, doseq=True)}"

    service_key = get_supabase_service_role_key()
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    data = None

    if prefer:
        headers["Prefer"] = prefer

    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")

    request = Request(
        url,
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urlopen(request, timeout=45) as response:
            text = response.read().decode("utf-8")
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase request failed with HTTP {error.code}: {error_body}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"Could not reach Supabase: {error.reason}") from error

    if not text:
        return None

    return json.loads(text)


def normalize_cohort(value):
    normalized = str(value or "").strip().lower()
    return "control" if normalized == "control" else "treatment"


def ensure_installation(
    install_token, trigger_topics=None, popup_threshold=None, cohort=None
):
    token_hash = hash_install_token(install_token)
    payload = {
        "install_token_hash": token_hash,
        "cohort": normalize_cohort(cohort),
    }

    if trigger_topics is not None:
        payload["trigger_topics"] = str(trigger_topics).strip()
    if popup_threshold is not None:
        payload["popup_threshold"] = max(0.0, min(1.0, float(popup_threshold)))

    rows = supabase_request(
        "POST",
        "installations",
        query={
            "on_conflict": "install_token_hash",
            "select": "id,install_token_hash,cohort,trigger_topics,popup_threshold,created_at",
        },
        body=payload,
        prefer="resolution=merge-duplicates,return=representation",
    )

    if not rows:
        rows = supabase_request(
            "GET",
            "installations",
            query={
                "install_token_hash": f"eq.{token_hash}",
                "select": "id,install_token_hash,cohort,trigger_topics,popup_threshold,created_at",
                "limit": "1",
            },
        )

    if not rows:
        raise RuntimeError("Could not load or create installation.")

    return rows[0]


def normalize_profile_entry(row):
    return {
        "id": str(row.get("id", "")).strip(),
        "postId": str(row.get("post_id", "")).strip(),
        "selectedEmotion": str(row.get("selected_emotion", "")).strip(),
        "triggerIntensity": int(row["trigger_intensity"])
        if isinstance(row.get("trigger_intensity"), int)
        else None,
        "summary": str(row.get("summary", "")).strip(),
        "arousalScore": float(row["final_score"])
        if isinstance(row.get("final_score"), (int, float))
        else None,
        "genericArousalScore": float(row["generic_score"])
        if isinstance(row.get("generic_score"), (int, float))
        else None,
        "personalizedArousalScore": float(row["personalized_score"])
        if isinstance(row.get("personalized_score"), (int, float))
        else None,
        "savedAt": parse_timestamp_millis(row.get("created_at")),
    }


def normalize_comment_activity(row):
    return {
        "id": str(row.get("id", "")).strip(),
        "postId": str(row.get("post_id", "")).strip(),
        "postText": str(row.get("post_text", "") or "").strip(),
        "commentText": str(row.get("comment_text", "")).strip(),
        "commentKind": str(row.get("comment_kind", "")).strip(),
        "parentCommentId": str(row.get("parent_comment_id", "") or "").strip(),
        "parentCommentText": str(row.get("parent_comment_text", "") or "").strip(),
        "arousalScore": float(row["final_score"])
        if isinstance(row.get("final_score"), (int, float))
        else None,
        "contentSignalScore": float(row["heuristic_score"])
        if isinstance(row.get("heuristic_score"), (int, float))
        else None,
        "llmContributionScore": float(row["llm_score"])
        if isinstance(row.get("llm_score"), (int, float))
        else None,
        "savedAt": parse_timestamp_millis(row.get("created_at")),
    }


def load_profile_data(install_token, cohort=None):
    installation = ensure_installation(install_token, cohort=cohort)
    rows = supabase_request(
        "GET",
        "reflections",
        query={
            "installation_id": f"eq.{installation['id']}",
            "select": "id,post_id,selected_emotion,trigger_intensity,summary,final_score,generic_score,personalized_score,created_at",
            "order": "created_at.desc",
        },
    ) or []

    return {
        "entries": [normalize_profile_entry(row) for row in rows],
        "tokenHash": str(installation.get("install_token_hash", "") or "").strip(),
        "cohort": normalize_cohort(installation.get("cohort", "")),
        "triggers": str(installation.get("trigger_topics", "") or "").strip(),
        "threshold": float(installation.get("popup_threshold", DEFAULT_POPUP_THRESHOLD))
        if isinstance(installation.get("popup_threshold"), (int, float))
        else DEFAULT_POPUP_THRESHOLD,
    }


def save_profile_settings(
    install_token, trigger_topics=None, popup_threshold=None, cohort=None
):
    installation = ensure_installation(
        install_token,
        trigger_topics=trigger_topics,
        popup_threshold=popup_threshold,
        cohort=cohort,
    )
    return {
        "tokenHash": str(installation.get("install_token_hash", "") or "").strip(),
        "cohort": normalize_cohort(installation.get("cohort", "")),
        "triggers": str(installation.get("trigger_topics", "") or "").strip(),
        "threshold": float(installation.get("popup_threshold", DEFAULT_POPUP_THRESHOLD))
        if isinstance(installation.get("popup_threshold"), (int, float))
        else DEFAULT_POPUP_THRESHOLD,
    }


def save_profile_reflection(
    install_token,
    post_id,
    selected_emotion,
    trigger_intensity,
    summary,
    final_score,
    generic_score,
    personalized_score,
    cohort=None,
):
    installation = ensure_installation(install_token, cohort=cohort)
    rows = supabase_request(
        "POST",
        "reflections",
        query={
            "select": "id,post_id,selected_emotion,trigger_intensity,summary,final_score,generic_score,personalized_score,created_at",
        },
        body={
            "installation_id": installation["id"],
            "post_id": post_id,
            "selected_emotion": selected_emotion,
            "trigger_intensity": trigger_intensity,
            "summary": summary,
            "final_score": final_score,
            "generic_score": generic_score,
            "personalized_score": personalized_score,
        },
        prefer="return=representation",
    )

    if not rows:
        return None

    return normalize_profile_entry(rows[0])


def delete_profile_entry(install_token, entry_id, cohort=None):
    installation = ensure_installation(install_token, cohort=cohort)
    supabase_request(
        "DELETE",
        "reflections",
        query={
            "id": f"eq.{entry_id}",
            "installation_id": f"eq.{installation['id']}",
            "select": "id",
        },
        prefer="return=representation",
    )


def clear_profile_data(install_token, cohort=None):
    installation = ensure_installation(install_token, cohort=cohort)
    supabase_request(
        "DELETE",
        "reflections",
        query={
            "installation_id": f"eq.{installation['id']}",
            "select": "id",
        },
        prefer="return=representation",
    )
    supabase_request(
        "PATCH",
        "installations",
        query={
            "id": f"eq.{installation['id']}",
            "select": "id,trigger_topics,popup_threshold",
        },
        body={
            "trigger_topics": "",
            "popup_threshold": DEFAULT_POPUP_THRESHOLD,
        },
        prefer="return=representation",
    )


def save_comment_activity(
    install_token,
    post_id,
    post_text,
    comment_text,
    comment_kind,
    parent_comment_id=None,
    parent_comment_text=None,
    final_score=None,
    heuristic_score=None,
    llm_score=None,
    cohort=None,
):
    installation = ensure_installation(install_token, cohort=cohort)
    normalized_kind = "reply" if str(comment_kind).strip().lower() == "reply" else "comment"
    rows = supabase_request(
        "POST",
        "comment_activity",
        query={
            "select": "id,post_id,post_text,comment_text,comment_kind,parent_comment_id,parent_comment_text,final_score,heuristic_score,llm_score,created_at",
        },
        body={
            "installation_id": installation["id"],
            "post_id": post_id,
            "post_text": str(post_text or "").strip(),
            "comment_text": comment_text,
            "comment_kind": normalized_kind,
            "parent_comment_id": str(parent_comment_id or "").strip() or None,
            "parent_comment_text": str(parent_comment_text or "").strip() or None,
            "final_score": float(final_score)
            if isinstance(final_score, (int, float))
            else None,
            "heuristic_score": float(heuristic_score)
            if isinstance(heuristic_score, (int, float))
            else None,
            "llm_score": float(llm_score)
            if isinstance(llm_score, (int, float))
            else None,
        },
        prefer="return=representation",
    )

    if not rows:
        return None

    return normalize_comment_activity(rows[0])


def extract_output_text(response_json):
    output_text = response_json.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    output = response_json.get("output", [])
    for item in output:
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str) and text.strip():
                return text

    raise ValueError("No text output returned by OpenAI.")


def call_openai_arousal_analysis(
    post_text, user_reported_triggers="", prior_labeled_posts_summary=""
):
    print(f"Analyzing post text (truncated to 20 chars): {post_text[:20]!r}")
    prompt = (
        PROMPT_TEMPLATE.replace("__POST_TEXT__", post_text)
        .replace("__USER_REPORTED_TRIGGERS__", user_reported_triggers or "none")
        .replace(
            "__PRIOR_LABELED_POSTS_SUMMARY__", prior_labeled_posts_summary or "none"
        )
    )
    request_body = {
        "model": MODEL,
        "input": prompt,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "reddit_post_arousal_analysis",
                "strict": True,
                "schema": SCHEMA,
            }
        },
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {get_api_key()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        print(f"OpenAI API error response body: {error.code}: {error_body}")
        raise RuntimeError(
            f"OpenAI request failed with HTTP {error.code}: {error_body}"
        ) from error
    except URLError as error:
        print(f"OpenAI API request failed: {error.reason}")
        raise RuntimeError(f"Could not reach OpenAI: {error.reason}") from error

    parsed = json.loads(extract_output_text(payload))
    result = {
        "generic_arousal_score": min(
            1.0, max(0.0, float(parsed["generic_arousal_score"]))
        ),
        "personalized_arousal_score": min(
            1.0, max(0.0, float(parsed["personalized_arousal_score"]))
        ),
        "label": str(parsed["label"]),
        "primary_emotion": str(parsed["primary_emotion"]),
        "generic_reason": str(parsed["generic_reason"]).strip()
        or "No generic reasoning returned.",
        "personalized_reason": str(parsed["personalized_reason"]).strip()
        or "No personalized reasoning returned.",
    }
    print(f"Analysis result: {result}")
    return result


def call_openai_profile_summary(
    post_text, selected_emotion, check_in_note, trigger_intensity, reappraisal_step
):
    prompt = (
        PROFILE_SUMMARY_PROMPT.replace("__POST_TEXT__", post_text)
        .replace("__SELECTED_EMOTION__", selected_emotion or "none")
        .replace("__TRIGGER_INTENSITY__", trigger_intensity or "")
        .replace("__CHECK_IN_NOTE__", check_in_note or "")
        .replace("__REAPPRAISAL_STEP__", reappraisal_step or "")
    )
    request_body = {
        "model": MODEL,
        "input": prompt,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "reddit_reflection_summary",
                "strict": True,
                "schema": PROFILE_SUMMARY_SCHEMA,
            }
        },
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {get_api_key()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"OpenAI request failed with HTTP {error.code}: {error_body}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"Could not reach OpenAI: {error.reason}") from error

    parsed = json.loads(extract_output_text(payload))
    return {
        "summary": str(parsed["summary"]).strip(),
    }


class Handler(BaseHTTPRequestHandler):
    def _write_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._write_json(200, {})

    def do_POST(self):
        if self.path not in {
            "/analyze-arousal",
            "/summarize-reflection",
            "/profile-data",
            "/profile-settings",
            "/profile-delete-entry",
            "/profile-clear-data",
            "/comment-activity",
        }:
            self._write_json(404, {"error": "Not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body or "{}")
            text = str(payload.get("text", payload.get("post_text", ""))).strip()
            install_token = str(payload.get("install_token", "")).strip()
            cohort = normalize_cohort(payload.get("extension_variant", ""))

            if self.path in {"/analyze-arousal", "/summarize-reflection"} and not text:
                self._write_json(400, {"error": "Missing post text"})
                return
            if self.path in {
                "/profile-data",
                "/profile-settings",
                "/profile-delete-entry",
                "/profile-clear-data",
                "/comment-activity",
            } and not install_token:
                self._write_json(400, {"error": "Missing install token"})
                return

            if self.path == "/analyze-arousal":
                result = call_openai_arousal_analysis(
                    text,
                    str(payload.get("user_reported_triggers", "")).strip(),
                    str(payload.get("prior_labeled_posts_summary", "")).strip(),
                )
            elif self.path == "/summarize-reflection":
                result = call_openai_profile_summary(
                    text,
                    str(payload.get("selected_emotion", "")).strip(),
                    str(payload.get("check_in_note", "")).strip(),
                    str(payload.get("trigger_intensity", "")).strip(),
                    str(payload.get("reappraisal_step", "")).strip(),
                )
                selected_emotion = str(payload.get("selected_emotion", "")).strip()
                post_id = str(payload.get("post_id", "")).strip()
                if install_token and selected_emotion and post_id and result["summary"]:
                    trigger_intensity_raw = payload.get("trigger_intensity_value")
                    trigger_intensity = (
                        int(trigger_intensity_raw)
                        if isinstance(trigger_intensity_raw, int)
                        else None
                    )
                    entry = save_profile_reflection(
                        install_token,
                        post_id,
                        selected_emotion,
                        trigger_intensity,
                        result["summary"],
                        payload.get("arousal_score"),
                        payload.get("generic_arousal_score"),
                        payload.get("personalized_arousal_score"),
                        cohort=cohort,
                    )
                    result["entry"] = entry
            elif self.path == "/profile-data":
                result = load_profile_data(install_token, cohort=cohort)
            elif self.path == "/profile-settings":
                result = save_profile_settings(
                    install_token,
                    trigger_topics=str(payload.get("user_reported_triggers", "")).strip()
                    if "user_reported_triggers" in payload
                    else None,
                    popup_threshold=payload.get("arousal_prompt_threshold")
                    if "arousal_prompt_threshold" in payload
                    else None,
                    cohort=cohort,
                )
            elif self.path == "/profile-delete-entry":
                entry_id = str(payload.get("entry_id", "")).strip()
                if not entry_id:
                    self._write_json(400, {"error": "Missing entry id"})
                    return
                delete_profile_entry(install_token, entry_id, cohort=cohort)
                result = {"ok": True}
            elif self.path == "/comment-activity":
                post_id = str(payload.get("post_id", "")).strip()
                comment_text = str(payload.get("comment_text", "")).strip()
                if not post_id:
                    self._write_json(400, {"error": "Missing post id"})
                    return
                if not comment_text:
                    self._write_json(400, {"error": "Missing comment text"})
                    return
                entry = save_comment_activity(
                    install_token,
                    post_id,
                    str(payload.get("post_text", "")).strip(),
                    comment_text,
                    str(payload.get("comment_kind", "")).strip(),
                    str(payload.get("parent_comment_id", "")).strip(),
                    str(payload.get("parent_comment_text", "")).strip(),
                    payload.get("arousal_score"),
                    payload.get("content_signal_score"),
                    payload.get("llm_contribution_score"),
                    cohort=cohort,
                )
                result = {"ok": True, "entry": entry}
            else:
                clear_profile_data(install_token, cohort=cohort)
                result = {"ok": True}
            self._write_json(200, result)
        except json.JSONDecodeError:
            self._write_json(400, {"error": "Invalid JSON request body"})
        except Exception as error:  # noqa: BLE001
            print(f"Backend request failed: {error}")
            traceback.print_exc()
            self._write_json(500, {"error": str(error)})

    def log_message(self, format, *args):
        return


def main():
    load_env_file()
    host = os.environ.get("HOST", DEFAULT_HOST).strip() or DEFAULT_HOST
    port = int(os.environ.get("PORT", str(DEFAULT_PORT)))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Arousal backend listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
