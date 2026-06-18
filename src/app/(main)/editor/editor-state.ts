import { base64urlEncode, base64urlDecode } from "@/lib/encode/codec";
import type { Scene } from "@/lib/scene/scene-spec";

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
  // B2 advanced canvas: when the user is in advanced mode, the full edited
  // Scene rides along so publish-from-canvas + sign-in-return stays lossless
  // (the basic preset+overrides can't reconstruct a free-form canvas).
  advanced?: boolean;
  scene?: Scene;
};

const DRAFT_KEY = "dynimage:editor-draft";

// Schema version for the persisted/encoded draft. Bump whenever the draft
// shape or its meaning changes (e.g. knob keys, preset ids). A draft whose
// version != current is DISCARDED on load — a stale draft from a prior
// build can't desync the editor (field-vs-render mismatch on a dirty
// reload). The in-memory EditorDraft stays version-free; `v` is a
// storage/wire concern stamped on save/encode and checked on read.
const DRAFT_VERSION = 2; // v2: + advanced/scene (B2 canvas)

// Validate + normalize a parsed object into an EditorDraft, enforcing the
// version. Returns null for a missing/mismatched version or a bad shape.
function parseDraft(obj: unknown): EditorDraft | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (o.v !== DRAFT_VERSION) return null; // stale/foreign draft → discard
  if (typeof o.presetName !== "string") return null;
  return {
    presetName: o.presetName,
    subject: typeof o.subject === "string" ? o.subject : "",
    theme: typeof o.theme === "string" ? o.theme : "dark",
    overrides:
      o.overrides && typeof o.overrides === "object"
        ? (o.overrides as EditorDraft["overrides"])
        : {},
    advanced: o.advanced === true,
    scene:
      o.scene && typeof o.scene === "object" ? (o.scene as Scene) : undefined,
  };
}

export function encodeEditorState(d: EditorDraft): string {
  return base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ v: DRAFT_VERSION, ...d })),
  );
}

export function decodeEditorState(s: string): EditorDraft | null {
  try {
    return parseDraft(JSON.parse(new TextDecoder().decode(base64urlDecode(s))));
  } catch {
    /* malformed ?s= — fall through to null (default/local restore) */
    return null;
  }
}

// The absolute URL that reopens the editor in this exact state — used as the
// sign-in `?redirect=` target so nothing is re-entered after auth.
export function editorReturnUrl(origin: string, d: EditorDraft): string {
  return `${origin}/editor?s=${encodeEditorState(d)}`;
}

export function saveDraft(d: EditorDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: DRAFT_VERSION, ...d }));
  } catch {
    /* storage blocked/full — non-fatal */
  }
}

export function loadDraft(): EditorDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return parseDraft(JSON.parse(raw)); // null (discarded) if version != current
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
