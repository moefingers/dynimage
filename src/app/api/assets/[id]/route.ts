import { assertCanUpload } from "@/lib/auth/upload-gate";
import { AuthError } from "@/lib/auth/session";
import { deleteAsset } from "@/lib/assets/store";
import { deleteAssetBlob } from "@/lib/assets/blob";

// DELETE /api/assets/<id> — owner-scoped removal (frees the maxAssets
// quota). Deletes the row first (the authoritative record), then
// best-effort the Blob; a row gone with a lingering blob is harmless
// (orphaned bytes), the reverse would dangle a broken reference.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { user } = await assertCanUpload(request);
    const { id } = await params;
    const row = await deleteAsset(id, user.id);
    if (!row) {
      return new Response("Asset not found.", { status: 404 });
    }
    await deleteAssetBlob(row.blobPathname).catch(() => {});
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response(e.message, { status: e.status });
    }
    return new Response(e instanceof Error ? e.message : "Delete failed", {
      status: 500,
    });
  }
}
