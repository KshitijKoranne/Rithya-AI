const state = {
  mode: "idle",
  pressActive: false,
  finishStarted: false,
  mediaRecorder: null,
  mediaStream: null,
  chunks: [],
  recognition: null,
  transcript: "",
  answer: "",
  lastAudio: null,
};

const elements = {
  body: document.body,
  readyLabel: document.querySelector("#ready-label"),
  readyPill: document.querySelector("#ready-pill"),
  stateKicker: document.querySelector("#state-kicker"),
  statusCopy: document.querySelector("#status-copy"),
  statusHelper: document.querySelector("#status-helper"),
  talkButton: document.querySelector("#talk-button"),
  talkLabel: document.querySelector("#talk-label"),
  answerCard: document.querySelector("#answer-card"),
  answerLabel: document.querySelector("#answer-label"),
  answerText: document.querySelector("#answer-text"),
  repeatButton: document.querySelector("#repeat-button"),
  askAgainButton: document.querySelector("#ask-again-button"),
};

const copy = {
  idle: {
    kicker: "ready",
    status: "Hold the button",
    helper: "Your voice can be Hindi, Marathi, Gujarati, English, or mixed.",
    button: "hold to ask",
  },
  listening: {
    kicker: "listening",
    status: "I’m listening",
    helper: "Keep holding. Let your question out.",
    button: "listening…",
  },
  thinking: {
    kicker: "thinking",
    status: "Making a short answer",
    helper: "One little moment.",
    button: "making an answer…",
  },
  speaking: {
    kicker: "speaking",
    status: "Here is your answer",
    helper: "You can ask another question when you are ready.",
    button: "ask another",
  },
  error: {
    kicker: "try again",
    status: "I didn’t catch that",
    helper: "Ask a little closer to the microphone.",
    button: "try again",
  },
};

function setMode(mode) {
  state.mode = mode;
  const nextCopy = copy[mode];
  elements.body.dataset.state = mode;
  elements.stateKicker.textContent = nextCopy.kicker;
  elements.statusCopy.textContent = nextCopy.status;
  elements.statusHelper.textContent = nextCopy.helper;
  elements.talkLabel.textContent = nextCopy.button;
  elements.talkButton.dataset.mode = mode;
  elements.talkButton.disabled = mode === "thinking";
  elements.talkButton.setAttribute("aria-label", mode === "listening" ? "Listening to your question" : `${nextCopy.button}, button`);
}

function showAnswer(answer, transcript = "") {
  state.answer = answer;
  state.transcript = transcript || state.transcript;
  elements.answerLabel.textContent = state.transcript ? "a little answer" : "lamp says";
  elements.answerText.textContent = answer;
  elements.answerCard.hidden = !answer;
}

function cleanupStream() {
  state.mediaStream?.getTracks().forEach((track) => track.stop());
  state.mediaStream = null;
}

function stopBrowserRecognition() {
  if (!state.recognition) return;
  try {
    state.recognition.stop();
  } catch {
    // The recognition object may already have stopped itself.
  }
  state.recognition = null;
}

function startBrowserRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return;

  const recognition = new Recognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = "en-IN";
  recognition.onresult = (event) => {
    let nextText = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      nextText += event.results[index][0].transcript;
    }
    state.transcript = nextText.trim();
  };
  recognition.onend = () => {
    if (state.recognition === recognition) state.recognition = null;
  };
  recognition.onerror = () => {
    if (state.recognition === recognition) state.recognition = null;
  };
  state.recognition = recognition;
  try {
    recognition.start();
  } catch {
    state.recognition = null;
  }
}

function chooseMimeType() {
  if (!window.MediaRecorder?.isTypeSupported) return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function beginListening() {
  if (state.mode === "thinking") return;
  if (state.mode === "speaking") resetForNextQuestion();

  state.pressActive = true;
  state.finishStarted = false;
  state.chunks = [];
  state.transcript = "";
  state.answer = "";
  elements.answerCard.hidden = true;
  setMode("listening");

  if (!navigator.mediaDevices?.getUserMedia) {
    setMode("error");
    elements.statusHelper.textContent = "This browser cannot use its microphone here.";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!state.pressActive) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    state.mediaStream = stream;
    const mimeType = chooseMimeType();
    if (window.MediaRecorder) {
      state.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      state.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) state.chunks.push(event.data);
      };
      state.mediaRecorder.start();
    }
    startBrowserRecognition();
    if (!state.pressActive) finishListening();
  } catch {
    cleanupStream();
    setMode("error");
    elements.statusHelper.textContent = "Ask a grown-up to turn on the microphone, then try again.";
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function finishListening() {
  if (state.finishStarted || state.mode !== "listening") return;
  state.finishStarted = true;
  state.pressActive = false;
  stopBrowserRecognition();
  setMode("thinking");

  const recorder = state.mediaRecorder;
  state.mediaRecorder = null;
  if (recorder && recorder.state !== "inactive") {
    recorder.onstop = async () => {
      const blob = state.chunks.length ? new Blob(state.chunks, { type: recorder.mimeType || "audio/webm" }) : null;
      cleanupStream();
      await sendTurn(blob);
    };
    recorder.stop();
    return;
  }

  cleanupStream();
  window.setTimeout(() => sendTurn(null), 300);
}

async function sendTurn(blob, textOverride = "") {
  try {
    const audioBase64 = blob ? await blobToDataUrl(blob) : null;
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: textOverride || state.transcript,
        audioBase64,
        mimeType: blob?.type || null,
      }),
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(25_000) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "voice turn failed");
    showAnswer(result.answer, result.transcript);
    setMode("speaking");
    if (result.audioBase64) {
      playProviderAudio(result.audioBase64, result.audioMimeType || "audio/wav");
    } else {
      speakWithBrowser(result.answer, result.languageCode);
    }
  } catch {
    setMode("error");
    elements.statusHelper.textContent = "The lamp needs another try. Check the internet and ask again.";
  }
}

function speakWithBrowser(text, languageCode = "en-IN") {
  if (!window.speechSynthesis || !text) {
    window.setTimeout(() => setMode("idle"), 1100);
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageCode || "en-IN";
  utterance.rate = 0.92;
  utterance.pitch = 1.04;
  utterance.onend = () => setMode("idle");
  utterance.onerror = () => setMode("idle");
  window.speechSynthesis.speak(utterance);
}

function playProviderAudio(base64, mimeType) {
  const audio = new Audio(`data:${mimeType};base64,${base64}`);
  state.lastAudio = audio;
  audio.onended = () => setMode("idle");
  audio.onerror = () => speakWithBrowser(state.answer);
  audio.play().catch(() => speakWithBrowser(state.answer));
}

function repeatAnswer() {
  if (!state.answer) return;
  if (state.lastAudio) {
    state.lastAudio.currentTime = 0;
    setMode("speaking");
    state.lastAudio.play().catch(() => speakWithBrowser(state.answer));
    return;
  }
  setMode("speaking");
  speakWithBrowser(state.answer, "en-IN");
}

function resetForNextQuestion() {
  state.pressActive = false;
  state.finishStarted = false;
  stopBrowserRecognition();
  cleanupStream();
  state.lastAudio?.pause();
  state.lastAudio = null;
  window.speechSynthesis?.cancel();
  state.answer = "";
  state.transcript = "";
  elements.answerCard.hidden = true;
  setMode("idle");
}

async function checkService() {
  try {
    const response = await fetch("/api/health");
    const result = await response.json();
    const configured = Boolean(result.configured);
    elements.readyLabel.textContent = configured ? "ready to listen" : "setup needed";
    elements.readyPill.dataset.configured = String(configured);
    elements.talkButton.disabled = !configured;
    if (!configured) elements.statusHelper.textContent = "Ask a grown-up to finish setting up the lamp.";
  } catch {
    elements.readyLabel.textContent = "not connected";
    elements.readyPill.dataset.configured = "false";
    elements.talkButton.disabled = true;
    elements.statusHelper.textContent = "The lamp needs a grown-up to check its connection.";
  }
}

elements.talkButton.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();
  elements.talkButton.setPointerCapture?.(event.pointerId);
  beginListening();
});
elements.talkButton.addEventListener("pointerup", (event) => {
  event.preventDefault();
  finishListening();
});
elements.talkButton.addEventListener("pointercancel", finishListening);
elements.talkButton.addEventListener("lostpointercapture", finishListening);
elements.repeatButton.addEventListener("click", repeatAnswer);
elements.askAgainButton.addEventListener("click", () => {
  resetForNextQuestion();
  elements.talkButton.focus();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.mode === "listening") finishListening();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

setMode("idle");
checkService();
