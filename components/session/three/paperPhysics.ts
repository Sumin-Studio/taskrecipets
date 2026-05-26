import * as THREE from "three";

export type VertexNode = {
  restY: number;
  currentRotX: number;
  velocity: number;
};

export const SEG_X = 6;
export const SEG_Y = 24;
export const RECEIPT_W = 3.8;

const STIFFNESS = 70;
const DAMPING = 13;
const MAX_SAG = 0.3;
const BEND_SCALE = 0.8;
/** How much a fully bent row darkens via vertex color (0 = no shadow, 1 = pure
 *  black). Bend magnitude is |currentRotX| normalized against MAX_SAG. The
 *  bent rows naturally darken symmetrically, which is what you'd see on a real
 *  curled piece of paper under overhead light — no Lambert math required. */
const SELF_SHADOW_STRENGTH = 0.18;

export function createPaperNodes(height: number): VertexNode[] {
  return Array.from({ length: SEG_Y + 1 }, (_, row) => ({
    restY: height / 2 - (row / SEG_Y) * height,
    currentRotX: 0,
    velocity: 0,
  }));
}

export function stepPaperPhysics({
  geometry,
  nodes,
  height,
  delta,
  grabFraction,
  dragSpeed,
  isDragging,
}: {
  geometry: THREE.PlaneGeometry;
  nodes: VertexNode[];
  height: number;
  delta: number;
  grabFraction: number;
  dragSpeed: number;
  isDragging: boolean;
}) {
  const positions = geometry.attributes.position;
  const grabY = height / 2 - grabFraction * height;
  const cappedDelta = Math.min(delta, 1 / 30);

  // Ensure the geometry has a per-vertex color buffer. The plane primitive
  // doesn't include one by default, and it's reset whenever args change.
  let colors = geometry.attributes.color as THREE.BufferAttribute | undefined;
  const vertexCount = (SEG_X + 1) * (SEG_Y + 1);
  if (!colors || colors.count !== vertexCount) {
    const arr = new Float32Array(vertexCount * 3).fill(1);
    colors = new THREE.BufferAttribute(arr, 3);
    geometry.setAttribute("color", colors);
  }

  for (let row = 0; row <= SEG_Y; row += 1) {
    const node = nodes[row];
    const rowFraction = row / SEG_Y;
    // Keep restY in sync with current height. Live receipts grow taller each
    // minute as new squares print; without this update the spring state would
    // have to be discarded on every height change (causing a visible
    // unbend/re-bend hiccup). Now spring state (currentRotX, velocity)
    // survives growth — rows just slide to new rest positions.
    node.restY = height / 2 - rowFraction * height;
    const targetAngle = isDragging
      ? (rowFraction - grabFraction) * MAX_SAG * dragSpeed
      : 0;

    const force =
      STIFFNESS * (targetAngle - node.currentRotX) - DAMPING * node.velocity;
    node.velocity += force * cappedDelta;
    node.currentRotX += node.velocity * cappedDelta;

    const rowDistance = node.restY - grabY;
    const z = Math.sin(node.currentRotX) * rowDistance * BEND_SCALE;

    // Per-row self-shadow: rows bent further from rest darken proportionally.
    // Sign-agnostic, so both edges of a C-curl darken symmetrically.
    const bendIntensity = Math.min(1, Math.abs(node.currentRotX) / MAX_SAG);
    const brightness = 1 - bendIntensity * SELF_SHADOW_STRENGTH;

    for (let col = 0; col <= SEG_X; col += 1) {
      const idx = row * (SEG_X + 1) + col;
      const restX = positions.getX(idx);
      const edge = Math.abs(restX) / (RECEIPT_W / 2);
      const edgeCurl = isDragging
        ? Math.sin(node.currentRotX) * edge * edge * 0.045 * dragSpeed
        : 0;
      positions.setZ(idx, z + edgeCurl);
      colors.setXYZ(idx, brightness, brightness, brightness);
    }
  }

  positions.needsUpdate = true;
  colors.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
