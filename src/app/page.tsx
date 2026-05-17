import { allCards } from "@/lib/cards/registry-all";

const DEMO_USER = "moefingers";

// Sample inputs per card-type for the home page demo grid. Cards
// requiring more than a user (repo, topic, etc.) would specify them
// here; the current set all take just a user, with `text` taking a
// literal string.
const DEMO_QUERIES: Record<string, Record<string, string>> = {
  commits: {},
  streak: {},
  portrait: {},
  text: { text: "hello, dynimage" },
};

function demoUrlFor(name: string, format: string): string {
  if (name === "text") {
    const params = new URLSearchParams(DEMO_QUERIES.text);
    return `/api/text/text.${format}?${params}`;
  }
  return `/api/${DEMO_USER}/${name}.${format}`;
}

export default function Home() {
  return (
    <main>
      <h1>dynimage</h1>
      <p>
        Dynamic GitHub stat images for README embeds. Animated SVG on Edge.
        Raster PNG/WebP/AVIF on Node via Skia + Sharp. Drop one URL into an{" "}
        <code>&lt;img&gt;</code> tag — it stays current.
      </p>

      <h2>Cards</h2>
      <div className="card-grid">
        {allCards().flatMap((c) =>
          Object.keys(c.formats).map((fmt) => (
            <figure key={`${c.name}.${fmt}`}>
              <img
                src={demoUrlFor(c.name, fmt)}
                alt={`${c.name} (${fmt})`}
                loading="lazy"
              />
              <figcaption style={{ color: "var(--muted)", fontSize: 13 }}>
                <code>
                  /api/&lt;user&gt;/{c.name}.{fmt}
                </code>{" "}
                — {c.runtime} — {c.meta.title}
              </figcaption>
            </figure>
          )),
        )}
      </div>

      <h2>URL shape</h2>
      <pre>
        <code>{`/api/<user>/<card>.<format>?<query>

card     commits | streak | portrait | text
format   svg | png | webp | avif      (per card; not all support all)
query    theme=dark|light|ocean|ember|forest|rose
         bg, accent, text, text-muted, gradient, stroke   (hex without #)
         w, h                                              (override size)

For the full machine-readable card catalog (used by the editor):
GET /api/meta`}</code>
      </pre>

      <h2>Examples</h2>
      <pre>
        <code>{`/api/${DEMO_USER}/commits.svg
/api/${DEMO_USER}/commits.png?theme=ocean
/api/${DEMO_USER}/streak.svg?accent=fb923c
/api/${DEMO_USER}/portrait.avif?theme=ember&w=900&h=400
/api/anything/text.svg?text=hello&size=48`}</code>
      </pre>

      <h2>SVG ↔ raster</h2>
      <p>
        SVG output is animated (SMIL pulse rings, accent-sheen sweeps, CSS
        keyframe entrance) and respects <code>prefers-color-scheme</code> when
        no <code>theme</code> param is given — one URL adapts to the
        viewer&apos;s reader. PNG/WebP/AVIF outputs are flat snapshots without
        animation.
      </p>

      <p>
        Repo:{" "}
        <a href="https://github.com/moefingers/dynimage">
          github.com/moefingers/dynimage
        </a>
      </p>
    </main>
  );
}
