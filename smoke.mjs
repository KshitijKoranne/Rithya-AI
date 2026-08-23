import assert from "node:assert/strict";
import fs from "node:fs";
import { audioFileName, decodeAudio, normalizeMimeType } from "./audio.mjs";

const baseUrl = process.env.APP_URL || "http://localhost:3000";
const indexSource = fs.readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("./public/app.js", import.meta.url), "utf8");

assert.doesNotMatch(indexSource, /id="answer-card"/u, "voice-only UI should not render an answer card");
assert.match(appSource, /addEventListener\("keydown"/u, "the ask button should support keyboard activation");

assert.deepEqual(
  decodeAudio(`data:audio/webm;codecs=opus;base64,${Buffer.alloc(128, 1).toString("base64")}`),
  Buffer.alloc(128, 1),
  "codec-bearing audio data URLs should decode without their metadata",
);
assert.equal(decodeAudio("data:audio/webm;base64,AAAA"), null, "empty audio payloads should be rejected");
assert.equal(decodeAudio("data:audio/webm;base64,not-base64!"), null, "invalid audio data should be rejected");
assert.equal(audioFileName("audio/webm;codecs=opus"), "question.webm", "WebM uploads should keep a WebM filename");
assert.equal(normalizeMimeType("audio/webm;codecs=opus"), "audio/webm", "provider MIME types should omit codec parameters");
assert.equal(audioFileName("audio/wav"), "question.wav", "WAV uploads should keep a WAV filename");

const health = await fetch(`${baseUrl}/api/health`);
assert.equal(health.status, 200, "health endpoint should respond");
const healthBody = await health.json();
assert.equal(healthBody.ok, true, "health endpoint should report ok");

const postJson = (payload) => fetch(`${baseUrl}/api/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const invalidJson = await fetch(`${baseUrl}/api/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "not-json",
});
assert.equal(invalidJson.status, 400, "malformed JSON should be a client error");
assert.equal((await invalidJson.json()).error, "invalid_json", "malformed JSON should have a stable error code");

const emptyQuestion = await postJson({});
assert.equal(emptyQuestion.status, 400, "empty questions should be rejected");
assert.equal((await emptyQuestion.json()).error, "no_question", "empty questions should have a stable error code");

const safety = await postJson({ text: "क्या मैं यह दवा अकेले ले सकता हूँ?" });
assert.equal(safety.status, 200, "safety turn should respond");
const safetyBody = await safety.json();
assert.equal(safetyBody.languageCode, "hi-IN", "safety answer should keep the question language");
assert.match(safetyBody.answer, /मम्मी|पापा|भरोसेमंद/i, "safety answer should defer to a trusted grown-up");

if (!healthBody.configured) {
  const missingKey = await postJson({ text: "क्या चाँद हमारी कार के साथ चलता है?" });
  assert.equal(missingKey.status, 503, "normal questions should require the Sarvam key");
  assert.equal((await missingKey.json()).error, "not_configured", "missing provider key should have a stable error code");
}

console.log("Little Lamp smoke check passed.");
