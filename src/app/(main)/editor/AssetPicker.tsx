"use client";

import { useCallback, useEffect, useState } from "react";
import type { Scene, ElementSpec } from "@/lib/scene/scene-spec";
import { useSession } from "@/lib/auth/client";
import { setAsset } from "./canvas-helpers";

// Inspector asset-picker (spec §10) — shown only for elements whose
// /api/meta entry has asset.accepts (the logo). Upload OR pick an existing
// uploaded image → sets ElementSpec.asset.id, which overrides the built-in
// icon. Uploads are account-gated (builder-2's /api/assets), so anonymous
// users get a contextual sign-in nudge. Reuses POST/GET/DELETE /api/assets;
// no new endpoints.

type AssetRow = { id: string; url: string; mime: string; size: number };

export function AssetPicker({
  scene,
  elementId,
  onScene,
}: {
  scene: Scene;
  elementId: string;
  onScene: (s: Scene) => void;
}) {
  const { data: session, isPending } = useSession();
  const authed = !!session?.user;
  const el = (scene.elements as ElementSpec[]).find((e) => e.id === elementId);
  const currentAssetId = el?.asset?.id;

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const loadAssets = useCallback(async () => {
    try {
      const r = await fetch("/api/assets", { credentials: "include" });
      if (r.ok) setAssets((await r.json()) as AssetRow[]);
    } catch {
      /* non-fatal — list stays empty */
    }
  }, []);

  useEffect(() => {
    // loadAssets setStates only after `await fetch` (deferred, not a
    // synchronous cascade); the lint heuristic can't see across the async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authed) void loadAssets();
  }, [authed, loadAssets]);

  const onUpload = useCallback(
    async (file: File) => {
      setBusy(true);
      setError("");
      try {
        const fd = new FormData();
        fd.set("file", file);
        const r = await fetch("/api/assets", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (r.status === 201) {
          const { id } = (await r.json()) as { id: string };
          onScene(setAsset(scene, elementId, { id }));
          void loadAssets();
        } else if (r.status === 401) {
          setError("Sign in to upload an image.");
        } else if (r.status === 503) {
          setError(
            "Asset storage isn't provisioned yet — upload will work once Blob is configured.",
          );
        } else {
          setError((await r.text()) || `Upload failed (${r.status}).`);
        }
      } catch {
        setError("Upload failed — please retry.");
      } finally {
        setBusy(false);
      }
    },
    [scene, elementId, onScene, loadAssets],
  );

  const signInHref = () => {
    const back =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/editor";
    return `/sign-in?redirect=${encodeURIComponent(back)}`;
  };

  return (
    <fieldset className="insp-group">
      <legend>Image / asset</legend>

      {currentAssetId ? (
        <div className="asset-current">
          <span className="muted small">
            Asset set (<code>{currentAssetId.slice(0, 10)}…</code>) — overrides
            the built-in icon.
          </span>
          <button
            type="button"
            className="btn small"
            onClick={() => onScene(setAsset(scene, elementId, null))}
          >
            Use built-in icon
          </button>
        </div>
      ) : (
        <p className="muted small">
          Using the built-in icon. Upload an image to override it.
        </p>
      )}

      {isPending ? (
        <p className="muted small">…</p>
      ) : authed ? (
        <>
          <label className="btn small asset-upload">
            {busy ? "Uploading…" : "Upload image"}
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg"
              style={{ display: "none" }}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
            />
          </label>

          {assets.length > 0 && (
            <div className="asset-grid">
              {assets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={
                    a.id === currentAssetId
                      ? "asset-thumb active"
                      : "asset-thumb"
                  }
                  title={`${a.mime} · ${Math.round(a.size / 1024)}KB`}
                  onClick={() =>
                    onScene(setAsset(scene, elementId, { id: a.id }))
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="muted small">
          <a href={signInHref()}>Sign in</a> to upload an image (the public path
          uses the built-in icons).
        </p>
      )}

      {error && <p className="publish-err">{error}</p>}
      <p className="muted small">
        Raster only (PNG/WebP/JPEG). Until Blob storage is provisioned, a set
        asset previews as the icon fallback (by design).
      </p>
    </fieldset>
  );
}
