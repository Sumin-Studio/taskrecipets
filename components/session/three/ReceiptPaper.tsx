"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { AnyReceipt } from "@/lib/store";
import { clamp01, createPaperNodes, RECEIPT_W, SEG_X, SEG_Y, stepPaperPhysics } from "./paperPhysics";
import { useReceiptTexture } from "./useReceiptTexture";

const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const pointerWorld = new THREE.Vector3();

export function ReceiptPaper({
  receipt,
  position,
  onReady,
}: {
  receipt: AnyReceipt;
  position: [number, number, number];
  onReady: () => void;
}) {
  const textureData = useReceiptTexture(receipt);
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const isDragging = useRef(false);
  const grabFraction = useRef(0.5);
  const dragOffset = useRef(new THREE.Vector3());
  const lastPointerWorld = useRef(new THREE.Vector3());
  const dragSpeed = useRef(0);
  const raycaster = useThree((state) => state.raycaster);
  const camera = useThree((state) => state.camera);
  const pointer = useThree((state) => state.pointer);
  const gl = useThree((state) => state.gl);

  const aspect = textureData ? textureData.height / textureData.width : 2.1;
  const height = RECEIPT_W * aspect;
  // Stable nodes — stepPaperPhysics keeps restY in sync with current height.
  const nodes = useMemo(() => createPaperNodes(height), []);

  useEffect(() => {
    if (textureData) onReady();
  }, [onReady, textureData]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;

    let frameDragSpeed = 0;

    if (isDragging.current) {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.ray.intersectPlane(dragPlane, pointerWorld);

      if (hit) {
        const targetX = hit.x + dragOffset.current.x;
        const targetY = hit.y + dragOffset.current.y;

        const dx = hit.x - lastPointerWorld.current.x;
        const dy = hit.y - lastPointerWorld.current.y;
        const velocity = Math.sqrt(dx * dx + dy * dy) / Math.max(delta, 0.001);
        frameDragSpeed = clamp01(velocity / 24);
        dragSpeed.current = THREE.MathUtils.lerp(dragSpeed.current, frameDragSpeed, 0.3);
        lastPointerWorld.current.copy(hit);

        group.position.x = THREE.MathUtils.lerp(group.position.x, targetX, 0.24);
        group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.24);
        group.position.z = THREE.MathUtils.lerp(group.position.z, 0.35, 0.18);
        group.rotation.z = THREE.MathUtils.lerp(
          group.rotation.z,
          THREE.MathUtils.degToRad(receipt.rotation) + (targetX - group.position.x) * 0.04,
          0.12,
        );
      }
    } else {
      dragSpeed.current = THREE.MathUtils.lerp(dragSpeed.current, 0, 0.12);
      group.position.z = THREE.MathUtils.lerp(group.position.z, position[2], 0.12);
      group.rotation.z = THREE.MathUtils.lerp(
        group.rotation.z,
        THREE.MathUtils.degToRad(receipt.rotation),
        0.08,
      );
    }

    stepPaperPhysics({
      geometry: mesh.geometry,
      nodes,
      height,
      delta,
      grabFraction: grabFraction.current,
      dragSpeed: dragSpeed.current,
      isDragging: isDragging.current || dragSpeed.current > 0.01,
    });
  });

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    isDragging.current = true;
    grabFraction.current = event.uv ? 1 - event.uv.y : 0.5;
    dragOffset.current.copy(groupRef.current?.position ?? new THREE.Vector3()).sub(event.point);
    lastPointerWorld.current.copy(event.point);
    gl.domElement.setPointerCapture(event.pointerId);
  }

  function releasePointer(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    isDragging.current = false;
    if (gl.domElement.hasPointerCapture(event.pointerId)) {
      gl.domElement.releasePointerCapture(event.pointerId);
    }
  }

  if (!textureData) return null;

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, 0, THREE.MathUtils.degToRad(receipt.rotation)]}
    >
      <mesh
        ref={meshRef}
        onPointerDown={handlePointerDown}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onPointerMissed={() => {
          isDragging.current = false;
        }}
      >
        <planeGeometry args={[RECEIPT_W, height, SEG_X, SEG_Y]} />
        <meshBasicMaterial
          key={textureData.texture.uuid}
          map={textureData.texture}
          color="#ffffff"
          side={THREE.FrontSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
