import { base64urlEncode, base64urlDecode } from "@/lib/encode/codec";

// ─────────────────────────────────────────────────────────────────────
// Editor draft state — survives refresh (localStorage) AND a sign-in
// round-trip (encoded into the return URL as ?s=). This is the funnel's
// "no work ever lost" invariant: a gated Publish saves the draft + returns
// the user to their EXACT editor state after sign-in (funnel-ux-spec §5/§8).
//
// This is the editor's *internal* state encoding (preset + subject + theme
// + knob overrides) — distinct from the *embed* encoding (?preset=/?c=),
// because it must round-trip the editing context, not just the render.
// ─────────────────────────────────────────────────────────────────────

export type EditorDraft = {
  presetName: string;
  subject: string;
  theme: string;
  overrides: Record<string, Record<string, unknown>>;
};

const DRAFT_KEY = "dynimage:editor-draft";

export function encodeEditorState(d: EditorDraft): string {
  return base64urlEncode(new TextEncoder().encode(JSON.stringify(d)));
}

export function decodeEditorState(s: string): EditorDraft | null {
  try {
    const obj = JSON.parse(new TextDecoder().decode(base64urlDecode(s)));
    if (obj && typeof obj === "object" && typeof obj.presetName === "string") {
      return {
        presetName: obj.presetName,
        subject: typeof obj.subject === "string" ? obj.subject : "",
        theme: typeof obj.theme === "string" ? obj.theme : "dark",
        overrides:
          obj.overrides && typeof obj.overrides === "object"
            ? obj.overrides
            : {},
      };
    }
  } catch {
    /* malformed ?s= — fall through to null (default/local restore) */
  }
  return null;
}

// The absolute URL that reopens the editor in this exact state — used as the
// sign-in `?redirect=` target so nothing is re-entered after auth.
export function editorReturnUrl(origin: string, d: EditorDraft): string {
  return `${origin}/editor?s=${encodeEditorState(d)}`;
}

export function saveDraft(d: EditorDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* storage blocked/full — non-fatal */
  }
}

export function loadDraft(): EditorDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && typeof obj.presetName === "string") {
      return {
        presetName: obj.presetName,
        subject: typeof obj.subject === "string" ? obj.subject : "",
        theme: typeof obj.theme === "string" ? obj.theme : "dark",
        overrides:
          obj.overrides && typeof obj.overrides === "object"
            ? obj.overrides
            : {},
      };
    }
  } catch {
    /* malformed draft — ignore */
  }
  return null;
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* non-fatal */
  }
}

// Read the initial draft for a fresh editor mount: ?s= in the URL (sign-in
// return) wins over a stored localStorage draft.
export function initialDraft(search: string): EditorDraft | null {
  const params = new URLSearchParams(search);
  const s = params.get("s");
  if (s) {
    const fromUrl = decodeEditorState(s);
    if (fromUrl) return fromUrl;
  }
  return loadDraft();
}
