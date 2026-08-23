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
  languageCode: "en-IN",
  lastAudio: null,
  pressAttempt: 0,
  permissionPending: false,
  finishRequested: false,
  keyboardActive: false,
  serviceConfigured: false,
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
    helper: "Hold the button and try again.",
    button: "try again",
  },
};

const languageTagByCode = {
  "en-IN": "en",
  "hi-IN": "hi",
  "mr-IN": "mr",
  "gu-IN": "gu",
};

const errorCopy = {
  invalid_json: "I did not catch that. Please hold the button and try again.",
  invalid_request: "I did not catch a question. Please try again.",
  no_question: "I did not hear a question. Hold the button and try again.",
  request_too_large: "That question is too large. Please try again.",
  not_configured: "The lamp needs a grown-up to finish setting it up.",
  rate_limited: "Let’s take a short pause, then ask again.",
  busy: "The lamp is helping another question. Please try again.",
  timeout: "That answer took too long. Please try again.",
  provider_unavailable: "The lamp needs a little rest. Please try again.",
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
  elements.talkButton.disabled = mode === "thinking" || !state.serviceConfigured;
  elements.talkButton.setAttribute("aria-pressed", String(mode === "listening"));
  elements.talkButton.setAttribute("aria-label", mode === "listening" ? "Listening to your question" : `${nextCopy.button}, button`);
  document.documentElement.lang = languageTagByCode[state.languageCode] || "en";
}

function showAnswer(answer, transcript = "", languageCode = "en-IN") {
  state.answer = answer;
  state.transcript = transcript || state.transcript;
  state.languageCode = languageCode || "en-IN";
  document.documentElement.lang = languageTagByCode[state.languageCode] || "en";
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

  const attempt = state.pressAttempt + 1;
  state.pressAttempt = attempt;
  state.pressActive = true;
  state.finishStarted = false;
  state.finishRequested = false;
  state.permissionPending = true;
  state.chunks = [];
  state.transcript = "";
  state.answer = "";
  setMode("listening");

  if (!navigator.mediaDevices?.getUserMedia) {
    state.permissionPending = false;
    setMode("error");
    elements.statusHelper.textContent = "This browser cannot use its microphone here.";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.permissionPending = false;
    if (attempt !== state.pressAttempt || !state.pressActive) {
      stream.getTracks().forEach((track) => track.stop());
      state.finishRequested = false;
      setMode("error");
      elements.statusHelper.textContent = "I did not hear a question. Hold the button and try again.";
      return;
    }
    state.mediaStream = stream;
    const mimeType = chooseMimeType();
    if (window.MediaRecorder) {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      state.mediaRecorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) state.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (attempt !== state.pressAttempt) return;
        state.mediaRecorder = null;
        cleanupStream();
        setMode("error");
        elements.statusHelper.textContent = "I did not catch that. Hold the button and try again.";
      };
      recorder.start(250);
    }
    startBrowserRecognition();
    if (!state.pressActive || state.finishRequested) finishListening();
  } catch {
    state.permissionPending = false;
    state.finishRequested = false;
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
  if (state.finishStarted) return;
  state.pressActive = false;
  if (state.permissionPending) {
    state.finishRequested = true;
    setMode("thinking");
    return;
  }
  if (state.mode !== "listening") return;
  state.finishStarted = true;
  stopBrowserRecognition();
  setMode("thinking");

  const recorder = state.mediaRecorder;
  state.mediaRecorder = null;
  if (recorder && recorder.state !== "inactive") {
    recorder.onstop = async () => {
      const blob = state.chunks.length ? new Blob(state.chunks, { type: recorder.mimeType || "audio/webm" }) : null;
      state.chunks = [];
      cleanupStream();
      await sendTurn(blob);
    };
    try {
      recorder.stop();
    } catch {
      cleanupStream();
      showError({ code: "no_question" });
    }
    return;
  }

  cleanupStream();
  window.setTimeout(() => sendTurn(null), 300);
}

async function sendTurn(blob, textOverride = "") {
  const questionText = textOverride || state.transcript;
  if (!blob && !questionText) {
    showError({ code: "no_question" });
    return;
  }
  try {
    const audioBase64 = blob ? await blobToDataUrl(blob) : null;
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: questionText,
        audioBase64,
        mimeType: blob?.type || null,
      }),
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(30_000) : undefined,
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.message || "voice turn failed");
      error.code = result.error;
      throw error;
    }
    showAnswer(result.answer, result.transcript, result.languageCode);
    setMode("speaking");
    if (result.audioBase64) {
      playProviderAudio(result.audioBase64, result.audioMimeType || "audio/wav", result.languageCode);
    } else {
      speakWithBrowser(result.answer, result.languageCode);
    }
  } catch (error) {
    showError(error);
  }
}

function showError(error) {
  setMode("error");
  elements.statusHelper.textContent = errorCopy[error?.code] || "The lamp needs a little rest. Please try again.";
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

function playProviderAudio(base64, mimeType, languageCode) {
  const audio = new Audio(`data:${mimeType};base64,${base64}`);
  state.lastAudio = audio;
  audio.onended = () => setMode("idle");
  audio.onerror = () => speakWithBrowser(state.answer, languageCode || state.languageCode);
  audio.play().catch(() => speakWithBrowser(state.answer, languageCode || state.languageCode));
}

function resetForNextQuestion() {
  state.pressAttempt += 1;
  state.pressActive = false;
  state.finishStarted = false;
  state.permissionPending = false;
  state.finishRequested = false;
  stopBrowserRecognition();
  cleanupStream();
  state.lastAudio?.pause();
  state.lastAudio = null;
  window.speechSynthesis?.cancel();
  state.answer = "";
  state.transcript = "";
  state.languageCode = "en-IN";
  setMode("idle");
}

async function checkService() {
  try {
    const response = await fetch("/api/health");
    const result = await response.json();
    const configured = Boolean(result.configured);
    state.serviceConfigured = configured;
    elements.readyLabel.textContent = configured ? "ready to listen" : "setup needed";
    elements.readyPill.dataset.configured = String(configured);
    setMode(state.mode);
    if (!configured) elements.statusHelper.textContent = "Ask a grown-up to finish setting up the lamp.";
  } catch {
    state.serviceConfigured = false;
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
elements.talkButton.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.repeat) return;
  event.preventDefault();
  state.keyboardActive = true;
  beginListening();
});
elements.talkButton.addEventListener("keyup", (event) => {
  if (!["Enter", " "].includes(event.key) || !state.keyboardActive) return;
  event.preventDefault();
  state.keyboardActive = false;
  finishListening();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.mode === "listening") finishListening();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

setMode("idle");
checkService();
