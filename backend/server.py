import json
import os
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = 8787
MODEL = "gpt-5-mini"

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
- The generic score should only use the post text.
- The personalized score is an additional personalization adjustment, not a second total score.
- The total LLM score should be interpreted as generic_arousal_score + personalized_arousal_score, clamped to 1.
- The personalized score should use the similarity of this post to the user's prior labeled posts and user-reported triggers.
- If the personalization context is blank or unrelated, personalized_arousal_score should be 0 or very close to 0.
- If user-reported triggers are blank, ignore them.
- If prior labeled post history is blank, ignore it.
- Do not assume the user always reacts strongly to related topics; only adjust when the similarity is meaningful.
- Keep personalized_arousal_score smaller than the generic score unless the match is unusually strong.
- If unsure, default to medium (0.4-0.6).

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
- any useful signal from the user's note or reappraisal step

Rules:
- Keep it under 80 words
- Be concrete and plain
- Do not quote the post
- If the note or reappraisal step is empty, ignore it

Selected emotion: __SELECTED_EMOTION__
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
    post_text, selected_emotion, check_in_note, reappraisal_step
):
    prompt = (
        PROFILE_SUMMARY_PROMPT.replace("__POST_TEXT__", post_text)
        .replace("__SELECTED_EMOTION__", selected_emotion or "none")
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
        if self.path not in {"/analyze-arousal", "/summarize-reflection"}:
            self._write_json(404, {"error": "Not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body or "{}")
            text = str(payload.get("text", payload.get("post_text", ""))).strip()

            if not text:
                self._write_json(400, {"error": "Missing post text"})
                return

            if self.path == "/analyze-arousal":
                result = call_openai_arousal_analysis(
                    text,
                    str(payload.get("user_reported_triggers", "")).strip(),
                    str(payload.get("prior_labeled_posts_summary", "")).strip(),
                )
            else:
                result = call_openai_profile_summary(
                    text,
                    str(payload.get("selected_emotion", "")).strip(),
                    str(payload.get("check_in_note", "")).strip(),
                    str(payload.get("reappraisal_step", "")).strip(),
                )
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
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Arousal backend listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
