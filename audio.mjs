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
