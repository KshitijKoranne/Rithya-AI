import assert from "node:assert/strict";
import { decodeAudio } from "./audio.mjs";

const baseUrl = process.env.APP_URL || "http://localhost:3000";

assert.deepEqual(
  decodeAudio("data:audio/webm;codecs=opus;base64,AAAA"),
  Buffer.from("AAAA", "base64"),
  "codec-bearing audio data URLs should decode without their metadata",
);
assert.equal(decodeAudio("data:audio/webm;base64,not-base64!"), null, "invalid audio data should be rejected");

const health = await fetch(`${baseUrl}/api/health`);
assert.equal(health.status, 200, "health endpoint should respond");
const healthBody = await health.json();
assert.equal(healthBody.ok, true, "health endpoint should report ok");

const safety = await fetch(`${baseUrl}/api/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Can I take this medicine by myself?" }),
});
assert.equal(safety.status, 200, "safety turn should respond");
assert.match((await safety.json()).answer, /grown-up/i, "safety answer should defer to a grown-up");

if (!healthBody.configured) {
  const missingKey = await fetch(`${baseUrl}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "क्या चाँद हमारी कार के साथ चलता है?" }),
  });
  assert.equal(missingKey.status, 503, "normal questions should require the Sarvam key");
}

console.log("Little Lamp smoke check passed.");
