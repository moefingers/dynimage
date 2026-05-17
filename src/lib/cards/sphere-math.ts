// Sphere projection + icosahedron geometry used by the orbit banner family.
// Ported from unlv-museum's banner-experiments sphere-math, narrowed to the
// pieces the banner cards actually use (no Bezier framing — banners render
// cheaper primitives so the SVG fits inline on a README).
//
// Coordinate convention: right-handed world, SVG-Y down on the output. Tilt-X
// rotates (y, z) — positive tiltX tips the top of the sphere toward the
// camera. Tilt-Z rotates (x, y) — positive tilts the spin axis to the
// viewer's left. Perspective is a simple z-depth divide with camera at z = D.

export interface Orientation {
  tiltX: number;
  tiltZ: number;
}

export const DEFAULT_TILT_X = Math.atan(44 / 140);
export const DEFAULT_ORIENTATION: Orientation = {
  tiltX: DEFAULT_TILT_X,
  tiltZ: 0,
};

export function orientationFromDegrees(
  tiltXdeg: number,
  tiltZdeg: number,
): Orientation {
  return {
    tiltX: (tiltXdeg * Math.PI) / 180,
    tiltZ: (tiltZdeg * Math.PI) / 180,
  };
}

export function makeScene(D: number) {
  function project(
    x: number,
    y: number,
    z: number,
    orient: Orientation,
  ): { x: number; y: number; depth: number; scale: number } {
    const cosX = Math.cos(orient.tiltX);
    const sinX = Math.sin(orient.tiltX);
    const cosZ = Math.cos(orient.tiltZ);
    const sinZ = Math.sin(orient.tiltZ);
    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;
    const x2 = x * cosZ - y1 * sinZ;
    const y2 = x * sinZ + y1 * cosZ;
    const s = D / (D - z1);
    return { x: x2 * s, y: -y2 * s, depth: z1, scale: s };
  }
  return { project };
}

// Fibonacci-sphere point distribution. Returns N (lat, lon) pairs that evenly
// cover the sphere using the golden-angle algorithm. lat in [-pi/2, pi/2].
export function fibonacciSphere(
  N: number,
): Array<{ lat: number; lon: number; idx: number }> {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const out: Array<{ lat: number; lon: number; idx: number }> = [];
  for (let i = 0; i < N; i++) {
    const y_i = 1 - (2 * i + 1) / N;
    const lat = Math.asin(y_i);
    const lon = goldenAngle * i;
    out.push({ lat, lon, idx: i });
  }
  return out;
}

// Build a comma-separated keyTimes string for N+1 evenly-spaced samples.
export function buildKeyTimes(N: number): string {
  const kt: string[] = [];
  for (let k = 0; k <= N; k++) kt.push((k / N).toFixed(4));
  return kt.join(";");
}

// ── Icosahedron ────────────────────────────────────────────────────────
//
// 12 vertices, 20 faces, 30 edges. Vertex coords are the canonical
// (0, ±1, ±phi), (±1, ±phi, 0), (±phi, 0, ±1) triples — all 12 lie on a
// sphere of radius sqrt(1 + phi^2). We scale to unit radius so the caller
// can multiply by the desired radius directly.

const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSA_NORM = Math.sqrt(1 + PHI * PHI);

const RAW_VERTICES: Array<[number, number, number]> = [
  [0, 1, PHI],
  [0, 1, -PHI],
  [0, -1, PHI],
  [0, -1, -PHI],
  [1, PHI, 0],
  [1, -PHI, 0],
  [-1, PHI, 0],
  [-1, -PHI, 0],
  [PHI, 0, 1],
  [PHI, 0, -1],
  [-PHI, 0, 1],
  [-PHI, 0, -1],
];

export const ICOSA_VERTICES: ReadonlyArray<readonly [number, number, number]> =
  RAW_VERTICES.map(
    ([x, y, z]) =>
      [x / ICOSA_NORM, y / ICOSA_NORM, z / ICOSA_NORM] as [
        number,
        number,
        number,
      ],
  );

// Derive the 30 edges by enumerating vertex pairs and keeping those whose
// distance equals the icosahedron edge length 2/sqrt(1+phi^2). Cheaper than
// hard-coding and provably correct.
function buildIcosaEdges(): ReadonlyArray<readonly [number, number]> {
  const target = 2 / ICOSA_NORM;
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < ICOSA_VERTICES.length; i++) {
    for (let j = i + 1; j < ICOSA_VERTICES.length; j++) {
      const a = ICOSA_VERTICES[i]!;
      const b = ICOSA_VERTICES[j]!;
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      const dz = a[2] - b[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (Math.abs(d - target) < 1e-6) edges.push([i, j]);
    }
  }
  return edges;
}

export const ICOSA_EDGES: ReadonlyArray<readonly [number, number]> =
  buildIcosaEdges();

// Rotate a 3D point around the Y axis by `theta`. Used for spinning the
// icosahedron and the marker positions; same rotation we apply per
// keyframe.
export function rotateY(
  p: readonly [number, number, number],
  theta: number,
): [number, number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
