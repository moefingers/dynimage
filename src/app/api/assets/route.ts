import { assertCanUpload } from "@/lib/auth/upload-gate";
import { AuthError } from "@/lib/auth/session";
import { validateAsset, MAX_ASSET_BYTES } from "@/lib/assets/validate";
import { uploadAssetBlob, blobConfigured } from "@/lib/assets/blob";
import { insertAsset, listOwnerAssets } from "@/lib/assets/store";
import { genId } from "@/lib/id";

// ─────────────────────────────────────────────────────────────────────
// Asset upload (spec §10). Session-gated (assertCanUpload: signed-in +
// within maxAssets). RASTER-ONLY (png/webp/jpeg) decided by magic bytes,
// not the declared Content-Type. Bytes → Vercel Blob; metadata → Neon.
//
//   POST /api/assets   multipart/form-data { file }  → 201 {id,url,mime,size}
//   GET  /api/assets                                 → 200 [{id,url,mime,size,createdAt}]
//
// NO arbitrary external-URL fetch anywhere (SSRF): the only input is the
// uploaded bytes; the element later references OUR stored blob by id.
// ─────────────────────────────────────────────────────────────────────
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const { user } = await assertCanUpload(request);

    if (!blobConfigured()) {
      return new Response(
        "Asset storage is not configured (BLOB_READ_WRITE_TOKEN missing).",
        { status: 503 },
      );
    }

    // Early size guard — reject before buffering the whole body into memory.
    // +1 KiB slack for multipart framing overhead.
    const declaredLen = Number(request.headers.get("content-length") ?? 0);
    if (declaredLen > MAX_ASSET_BYTES + 1024) {
      return new Response(
        `Upload exceeds the ${MAX_ASSET_BYTES}-byte cap.`,
        { status: 413 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response(
        "Expected multipart/form-data with a 'file' field.",
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const v = validateAsset(bytes, file.type || null);
    if (!v.ok) return new Response(v.error, { status: v.status });

    const id = genId();
    const { url, pathname } = await uploadAssetBlob(id, bytes, v.mime);
    await insertAsset({
      id,
      ownerId: user.id,
      mime: v.mime,
      size: v.size,
      blobUrl: url,
      blobPathname: pathname,
    });

    return Response.json(
      { id, url, mime: v.mime, size: v.size },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(e.message, { status: e.status });
    }
    return new Response(e instanceof Error ? e.message : "Upload failed", {
      status: 500,
    });
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { user } = await assertCanUpload(request);
    const rows = await listOwnerAssets(user.id);
    // Owner-facing list — safe fields only (no blobPathname internals).
    return Response.json(
      rows.map((r) => ({
        id: r.id,
        url: r.blobUrl,
        mime: r.mime,
        size: r.size,
        createdAt: r.createdAt,
      })),
    );
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(e.message, { status: e.status });
    }
    return new Response(e instanceof Error ? e.message : "List failed", {
      status: 500,
    });
  }
}
