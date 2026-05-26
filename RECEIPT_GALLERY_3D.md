# Three.js Receipt Gallery — Implementation Plan

## Context

This is a Next.js 16.2.6 app (React 19, TypeScript, Tailwind 4, Zustand 5, framer-motion 12).
**Read `AGENTS.md` before touching any Next.js APIs — this version has breaking changes.**

The target component is `components/session/SessionGallery.tsx`.
It currently renders task receipts as draggable HTML elements using framer-motion.
The goal is to replace it with a Three.js canvas scene where each receipt is a physically
deformable paper mesh — textured with the actual receipt content — that you can grab, drag,
and feel flex at the edges based on where you're holding it.

The `Receipt` component (`components/tray/Receipt.tsx`) renders the full receipt HTML:
logo, "SESSION SUMMARY" or task title, squares grid (one square per minute, black = work),
mood photo, stats rows. This is what needs to become the mesh texture.

---

## Dependencies to Install

```bash
npm install three @react-three/fiber @react-three/drei html2canvas
npm install --save-dev @types/three
```

- **`three`** — core WebGL renderer and math
- **`@react-three/fiber` (R3F)** — React reconciler for Three.js; write JSX instead of imperative Three.js
- **`@react-three/drei`** — helpers: `useTexture`, `PerspectiveCamera`, `Environment`, etc.
- **`html2canvas`** — renders an HTML DOM node to a `<canvas>`, which becomes the mesh texture

---

## Architecture Overview

```
SessionGallery
  └── <Canvas>                        ← R3F canvas, fills the gallery container
       ├── <ambientLight>
       ├── <directionalLight>
       ├── <PerspectiveCamera>
       └── {receipts.map(r =>
            <ReceiptPaper receipt={r} position={...} />
           )}
```

Each `<ReceiptPaper>` is a self-contained R3F component that owns:
- Its `PlaneGeometry` mesh (the paper)
- Its `CanvasTexture` (the rendered receipt HTML)
- Its spring-mass vertex simulation (the bend physics)
- Its drag interaction via raycasting

---

## Step 1 — Texture Generation

The receipt HTML needs to be rasterised once per receipt and turned into a Three.js texture.

### Approach

1. Render the `<Receipt receipt={r} />` component into a hidden off-screen `<div>` in the DOM
   (standard React `createPortal` into a fixed invisible container).
2. After the div mounts, call `html2canvas(divRef.current, { scale: 2 })` to get a `HTMLCanvasElement`.
3. Pass that canvas into `new THREE.CanvasTexture(canvas)` — Three.js uses the canvas pixels directly.
4. Dispose of the off-screen div once the texture is ready.

### Caveats
- `html2canvas` cannot cross origins. If receipt photos (`photoDataUrl`) are base64 data URIs this is fine. If they're external URLs, set `useCORS: true` on the html2canvas call.
- CSS custom properties (`--color-receipt`, `--color-receipt-ink`) must be computed values at capture time — html2canvas reads inline styles, not CSS vars. Before calling html2canvas, walk the div and resolve all var() values with `getComputedStyle`.
- Fonts must be loaded by the time html2canvas runs. Use a `document.fonts.ready` guard.
- The capture div must be in the real DOM (not `display:none`) — use `visibility: hidden; position: fixed; left: -9999px`.
- Set an explicit pixel width on the capture div matching the receipt's design width (380px × 2 = 760px for 2× scale).

### Hook

```ts
// lib/useReceiptTexture.ts
export function useReceiptTexture(receipt: AnyReceipt): THREE.CanvasTexture | null
```

Returns `null` while the texture is generating, the texture once ready. Use a `useEffect` that
calls html2canvas and sets state. Clean up with `texture.dispose()` on unmount.

---

## Step 2 — Mesh Setup

Each receipt is a `THREE.PlaneGeometry` with enough subdivision to deform smoothly.

```ts
// Width and height in Three.js world units — choose a scale where the gallery
// camera shows all receipts comfortably. E.g. 1 unit = 100px screen.
const RECEIPT_W = 3.8;     // 380px at 1:100
const RECEIPT_H = 8.0;     // ~800px receipt height (varies — measure texture aspect)
const SEG_X = 1;           // no horizontal subdivision needed (receipts are narrow)
const SEG_Y = 20;          // 20 rows = smooth vertical bend curve
```

```tsx
<mesh ref={meshRef}>
  <planeGeometry args={[RECEIPT_W, RECEIPT_H, SEG_X, SEG_Y]} />
  <meshStandardMaterial
    map={texture}
    side={THREE.FrontSide}
    roughness={0.85}        // matte paper
    metalness={0.0}
  />
</mesh>
```

The plane's vertices (stored in `geometry.attributes.position`) are what you animate.
Store the **original (rest) positions** in a ref at mount — this is what the spring system
pulls each vertex back toward.

---

## Step 3 — Spring-Mass Vertex Physics

This is the core of the paper feel.

### Data structure

Each vertex on the Y axis is a "node" in a 1D spring chain (we only bend in Y, not X).
There are `SEG_Y + 1 = 21` rows of vertices.

```ts
type VertexNode = {
  restY: number;       // original Y position from geometry
  currentRotX: number; // current rotateX angle for this row (radians)
  velocity: number;    // angular velocity
};
```

### Physics loop (runs in `useFrame`)

Each frame, for every vertex row `i`:

1. **Compute target angle** based on grab state:
   - If dragging: `targetAngle[i] = (rowCenter - grabFraction) * MAX_SAG * dragSpeed`
     - `rowCenter` = normalised Y position of this row (0=top, 1=bottom)
     - `grabFraction` = where on the receipt the pointer landed (0=top, 1=bottom)
     - `dragSpeed` = magnitude of drag velocity, mapped to [0, 1]
   - If not dragging: `targetAngle[i] = 0` (spring back to flat)

2. **Spring step**:
   ```
   force = STIFFNESS * (targetAngle[i] - node.currentRotX) - DAMPING * node.velocity
   node.velocity += force * deltaTime
   node.currentRotX += node.velocity * deltaTime
   ```
   Good starting values: `STIFFNESS = 120`, `DAMPING = 18`.

3. **Apply to geometry**: convert `currentRotX` to a Z displacement of the vertex
   relative to its row's Y position and the grab point distance:
   ```
   vertex.z = sin(node.currentRotX) * rowDistFromGrab * BEND_SCALE
   ```
   Where `rowDistFromGrab` = distance in world units between this row and the grab row.

4. After updating all vertices:
   ```ts
   geometry.attributes.position.needsUpdate = true;
   geometry.computeVertexNormals(); // keeps lighting correct as mesh bends
   ```

### MAX_SAG tuning
Start at `0.3` radians (~17°) at the extremes for a fast flick. Feels like
picking up a thermal receipt. Reduce if it looks too dramatic.

---

## Step 4 — Drag Interaction

### Grab detection

Use R3F's `onPointerDown` on the mesh:

```tsx
<mesh
  onPointerDown={(e) => {
    e.stopPropagation();
    // e.uv gives the UV coordinate at the hit point (0,0 = bottom-left, 1,1 = top-right)
    // Convert to grab fraction (0 = top of receipt, 1 = bottom)
    grabFractionRef.current = 1 - e.uv.y;
    isDraggingRef.current = true;
  }}
  onPointerUp={() => { isDraggingRef.current = false; }}
  onPointerLeave={() => { isDraggingRef.current = false; }}
/>
```

`e.uv` is the UV coordinate at the exact pixel the pointer hit — this gives you
the precise grab fraction for free from the raycast hit.

### Moving the receipt

Track pointer position in world space using a `Raycaster` against an invisible
floor plane (z=0). In `useFrame`:
- Cast a ray from camera through pointer
- Hit the floor plane → get world position
- Lerp the mesh's `position.x` and `position.y` toward the hit point (spring follow)
- The Z axis stays at 0 (paper lies flat on the tray surface)

Use R3F's `useThree().raycaster` and listen to `canvas.onPointermove` for the raw pointer coords.

### Drag velocity

Keep a rolling `lastPointerWorld` ref. Each frame:
```ts
dragVelocity = (currentPointerWorld - lastPointerWorld) / deltaTime
dragSpeed = clamp(length(dragVelocity) / 2000, 0, 1)
```

This `dragSpeed` feeds into the sag intensity computation in Step 3.

---

## Step 5 — Lighting

Good lighting sells the paper bend because vertex normals update dynamically.

```tsx
<ambientLight intensity={0.6} />
<directionalLight
  position={[3, 8, 5]}
  intensity={1.2}
  castShadow={false}
/>
<directionalLight
  position={[-2, 4, 2]}
  intensity={0.4}
  color="#e8e0d8"    // warm fill from the other side
/>
```

The `meshStandardMaterial` with `roughness={0.85}` will show subtle shading shifts
as the paper curves. No need for a separate shadow pass.

---

## Step 6 — Camera & Layout

```tsx
<PerspectiveCamera
  makeDefault
  position={[0, 0, 20]}   // looking straight down the Z axis
  fov={45}
/>
```

Lay receipts out in a grid in world space, matching the existing CSS grid layout:
- 3 columns, up to 4 rows
- Spacing ~5 world units apart
- Each receipt starts with a slight random Z rotation (matching `receipt.rotation` degrees → radians)

The `<Canvas>` element should fill the gallery container div exactly:
```tsx
<Canvas style={{ width: "100%", height: "100%" }} gl={{ antialias: true, alpha: true }}>
```

Set `alpha: true` so the canvas background is transparent and the app's ground colour
shows through.

---

## Step 7 — Integration into SessionGallery

Replace the current framer-motion draggable grid with:

```tsx
// components/session/SessionGallery.tsx
export function SessionGallery({ receipts }) {
  return (
    <div className="flex-1 min-h-0 relative">
      <Canvas ...>
        <Scene receipts={receipts} />
      </Canvas>
    </div>
  );
}
```

Keep the existing empty-state fallback (`receipts.length === 0` check) outside the Canvas.

The `ReceiptPaper` component (inside the Canvas) handles its own texture generation,
mesh, physics, and drag — it is self-contained per receipt.

---

## File Structure

```
components/session/
  SessionGallery.tsx          ← replace existing, now just wraps Canvas
  three/
    Scene.tsx                 ← R3F scene: lights, camera, layout
    ReceiptPaper.tsx          ← single receipt mesh + physics + drag
    useReceiptTexture.ts      ← html2canvas → CanvasTexture hook
    paperPhysics.ts           ← pure spring-mass math (no React deps)
```

---

## Physics Tuning Reference

| Parameter | Start value | Effect |
|-----------|-------------|--------|
| `SEG_Y` | 20 | Smoothness of bend curve. 12 is min, 30 is max useful |
| `STIFFNESS` | 120 | How snappy the paper springs back. Higher = stiffer paper |
| `DAMPING` | 18 | How quickly oscillation dies. Higher = less flutter |
| `MAX_SAG` | 0.3 rad | Peak bend angle at max speed. ~17° feels like thermal paper |
| `BEND_SCALE` | 0.8 | How far vertices displace in Z. Keeps bend subtle |
| `dragSpeed` mapping | 0–2000 px/s → 0–1 | Velocity range to saturate the sag |

---

## Known Gotchas

1. **html2canvas + CSS vars**: resolve all `var(--color-*)` to hex before calling html2canvas,
   otherwise receipts may render black/blank.
2. **Texture aspect ratio**: measure the rendered receipt div height before calling html2canvas.
   The `PlaneGeometry` height must match the texture's aspect ratio or content will stretch.
3. **`"use client"` required**: all Three.js / R3F code must be in client components.
   Wrap with dynamic import and `ssr: false` at the `SessionGallery` level to prevent
   server-render attempts.
4. **Pointer events**: set `gl.domElement.style.touchAction = "none"` in an R3F `useEffect`
   to prevent mobile scroll interference during drag.
5. **Disposal**: call `texture.dispose()` and `geometry.dispose()` when `ReceiptPaper` unmounts.
6. **Next.js 16 breaking changes**: read `node_modules/next/dist/docs/` before any
   dynamic import or API usage — conventions differ from Next.js 14/15.
