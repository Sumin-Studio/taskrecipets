"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AnyReceipt } from "@/lib/store";
import { useStore } from "@/lib/store";
import {
  createPaperNodes,
  RECEIPT_W,
  SEG_X,
  SEG_Y,
  stepPaperPhysics,
} from "@/components/session/three/paperPhysics";
import { useReceiptTexture } from "@/components/session/three/useReceiptTexture";

const STACK_W_PX = 380;
const STACK_H_PX = 560;
const UNIT_PX = 100;
const STACK_Y_STEP = 0.08;
const STACK_Z_STEP = 0.035;

export function ReceiptStack({
  hiddenReceiptId,
  onHiddenReceiptReady,
}: {
  hiddenReceiptId?: string | null;
  onHiddenReceiptReady?: (receiptId: string) => void;
}) {
  const receipts = useStore((s) => s.receipts);
  const recent = [...receipts].slice(-12).reverse();

  return (
    <div
      className="relative w-[380px] h-[560px] pointer-events-none"
      style={{ filter: "drop-shadow(0 16px 20px rgba(0,0,0,0.18))" }}
      aria-hidden
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 10], zoom: UNIT_PX }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        style={{ width: STACK_W_PX, height: STACK_H_PX }}
      >
        <ReceiptStackScene
          receipts={recent}
          hiddenReceiptId={hiddenReceiptId}
          onHiddenReceiptReady={onHiddenReceiptReady}
        />
      </Canvas>
    </div>
  );
}

function ReceiptStackScene({
  receipts,
  hiddenReceiptId,
  onHiddenReceiptReady,
}: {
  receipts: AnyReceipt[];
  hiddenReceiptId?: string | null;
  onHiddenReceiptReady?: (receiptId: string) => void;
}) {
  return (
    <>
      {receipts.map((receipt, index) => (
        <StackedReceiptMesh
          key={receipt.id}
          receipt={receipt}
          stackIndex={index}
          isHidden={receipt.id === hiddenReceiptId}
          onHiddenReceiptReady={onHiddenReceiptReady}
        />
      ))}
    </>
  );
}

function StackedReceiptMesh({
  receipt,
  stackIndex,
  isHidden,
  onHiddenReceiptReady,
}: {
  receipt: AnyReceipt;
  stackIndex: number;
  isHidden: boolean;
  onHiddenReceiptReady?: (receiptId: string) => void;
}) {
  const textureData = useReceiptTexture(receipt);
  const meshRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);

  const aspect = textureData ? textureData.height / textureData.width : 1.45;
  const height = RECEIPT_W * aspect;
  const topY = STACK_H_PX / UNIT_PX / 2;
  const y = topY - height / 2 - stackIndex * STACK_Y_STEP;
  const z = 0.1 - stackIndex * STACK_Z_STEP;
  const scale = 1 - stackIndex * 0.012;
  const rotationZ = THREE.MathUtils.degToRad(receipt.rotation + stackIndex * 0.4);
  const rotationX = THREE.MathUtils.degToRad(-2.5 - stackIndex * 0.4);
  // Stable nodes — stepPaperPhysics keeps restY in sync with current height.
  const nodes = useMemo(() => createPaperNodes(height), []);

  useEffect(() => {
    if (!isHidden || !textureData) return;
    onHiddenReceiptReady?.(receipt.id);
  }, [isHidden, onHiddenReceiptReady, receipt.id, textureData]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.position.set(0, y, z);
    mesh.rotation.set(rotationX, 0, rotationZ);
    mesh.scale.setScalar(scale);

    stepPaperPhysics({
      geometry: mesh.geometry,
      nodes,
      height,
      delta,
      grabFraction: 0.4,
      dragSpeed: stackIndex === 0 ? 0.035 : 0.015,
      isDragging: true,
    });
  });

  if (!textureData) return null;

  return (
    <group renderOrder={100 - stackIndex}>
      <mesh
        position={[0.04 + stackIndex * 0.006, y - 0.05, z - 0.02]}
        rotation={[rotationX, 0, rotationZ]}
        scale={[scale * 1.02, scale, 1]}
      >
        <planeGeometry args={[RECEIPT_W, height, 1, 1]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={isHidden ? 0 : stackIndex === 0 ? 0.11 : 0.07}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={meshRef} position={[0, y, z]} rotation={[rotationX, 0, rotationZ]}>
        <planeGeometry args={[RECEIPT_W, height, SEG_X, SEG_Y]} />
        <meshBasicMaterial
          map={textureData.texture}
          color="#ffffff"
          transparent={isHidden}
          opacity={isHidden ? 0 : 1}
          depthWrite={!isHidden}
          side={THREE.FrontSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
