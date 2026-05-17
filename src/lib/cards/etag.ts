// SHA-256 hex digest over the response body, used as a weak-ish ETag.
// crypto.subtle is available on both Edge and Node runtimes.
export async function etagOf(body: string | Uint8Array): Promise<string> {
  // Re-wrap into an ArrayBuffer-backed Uint8Array so crypto.subtle's
  // BufferSource type (which excludes SharedArrayBuffer-backed views)
  // is satisfied without a cast.
  const source =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  const buf = new ArrayBuffer(source.byteLength);
  new Uint8Array(buf).set(source);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `"${hex.slice(0, 32)}"`;
}
