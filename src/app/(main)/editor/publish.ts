import type { Scene } from "@/lib/scene/scene-spec";

// The publish call — POSTs the config to deputy's gated /api/publish (the
// ONLY authorized writer of published_embeds). ownerId comes from the
// session cookie (credentials:'include'); we never send it. On success the
// route returns builder-2's PublishResult (final, paste-ready snippet — we
// render it verbatim, never reconstruct it). `format` is intentionally NOT
// sent: publish pre-warms all variants and the embed renders via /i/<id>.

export type PublishResult = {
  id: string;
  url: string;
  snippet: string;
  exposesPrivateData?: boolean;
};

export type PublishOutcome =
  | { ok: true; result: PublishResult }
  | { ok: false; status: number; message: string };

export async function publishScene(
  scene: Scene,
  href: string,
  alt: string,
): Promise<PublishOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/publish", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: scene, href, alt }),
    });
  } catch {
    return { ok: false, status: 0, message: "Network error — please retry." };
  }

  if (res.ok) {
    return { ok: true, result: (await res.json()) as PublishResult };
  }

  // Surface deputy's gate message (JSON {error}|{message} or plain text).
  let message = `Publish failed (${res.status}).`;
  try {
    const body = await res.clone().json();
    if (body && typeof body === "object") {
      message = (body.error as string) ?? (body.message as string) ?? message;
    } else if (typeof body === "string" && body) {
      message = body;
    }
  } catch {
    try {
      const text = await res.text();
      if (text) message = text;
    } catch {
      /* keep default */
    }
  }
  return { ok: false, status: res.status, message };
}
