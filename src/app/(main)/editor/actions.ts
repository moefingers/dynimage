"use server";

import { getPreset } from "@/lib/scene/presets";
import type { Scene } from "@/lib/scene/scene-spec";
import type { SubjectKind } from "@/lib/scene/types";

// Server action: build a preset's Scene for a subject. The build bakes the
// subject into the data binds + the @handle text, so the client can't do it
// alone — it asks here, then tweaks knobs locally and previews/encodes the
// returned Scene. Reuses the preset registry; touches no render/auth code.
export async function buildPresetScene(
  name: string,
  subjectId: string,
  kind: SubjectKind = "user",
): Promise<Scene | null> {
  const preset = getPreset(name);
  if (!preset) return null;
  // A blank subject still builds (binds resolve to "@" placeholders); the
  // preview just shows the structure until a real subject is entered.
  return preset.build({ subject: { kind, id: subjectId || "your-handle" } });
}
