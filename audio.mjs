const extensionByMimeType = {
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

export function normalizeMimeType(mimeType) {
  return typeof mimeType === "string" ? mimeType.split(";", 1)[0].trim().toLowerCase() : "";
}

export function audioFileName(mimeType) {
  const type = normalizeMimeType(mimeType);
  return `question.${extensionByMimeType[type] || "webm"}`;
}

export function decodeAudio(value) {
  if (typeof value !== "string" || value.length === 0) return null;

  let encoded = value;
  if (value.startsWith("data:")) {
    const comma = value.indexOf(",");
    const metadata = comma >= 0 ? value.slice(0, comma) : "";
    if (!metadata.includes(";base64")) return null;
    encoded = value.slice(comma + 1);
  }

  if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) return null;
  const buffer = Buffer.from(encoded, "base64");
  return buffer.length > 0 ? buffer : null;
}
