import { db, schema } from "@/lib/db/client";
import { genId } from "@/lib/id";
const userId = genId(),
  embedId = genId();
await db
  .insert(schema.user)
  .values({
    id: userId,
    name: "mod410",
    email: `${userId}@test.local`,
    emailVerified: true,
  });
await db
  .insert(schema.publishedEmbeds)
  .values({
    id: embedId,
    ownerId: userId,
    config: {
      v: 1,
      canvas: { w: 900, h: 320, theme: "ocean" },
      elements: [
        {
          id: "t",
          type: "text",
          transform: { x: 10, y: 10, w: 880, h: 300 },
          knobs: { text: "x", size: 20 },
        },
      ],
    },
    disabled: true,
  });
console.log(JSON.stringify({ userId, embedId }));
