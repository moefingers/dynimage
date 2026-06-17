// Unguessable, URL-safe random ids (spec §8: published ids must be random,
// never sequential). Edge + node safe (Web Crypto + btoa). 16 bytes ⇒ 128
// bits of entropy, ~22 base64url chars.
export function genId(bytes = 16): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
