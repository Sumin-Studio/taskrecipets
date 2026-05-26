"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AnyReceipt } from "@/lib/store";
import { PRINTER_TO_STACK_OFFSET } from "@/lib/trayLayout";
import {
  createPaperNodes,
  RECEIPT_W,
  SEG_X,
  SEG_Y,
  stepPaperPhysics,
} from "@/components/session/three/paperPhysics";
import { useReceiptTexture } from "@/components/session/three/useReceiptTexture";

const RECEIPT_W_PX = 380;
const STACK_H = 560;
const UNIT_PX = 100;
const LANDING_DURATION = 1.25;

export function PrintedReceipt3D({
  receipt,
  active,
  onReady,
  onComplete,
}: {
  receipt: AnyReceipt;
  active: boolean;
  onReady: () => void;
  onComplete: () => void;
}) {
  const canvasHeight = STACK_H + PRINTER_TO_STACK_OFFSET;

  return (
    <div
      className="absolute left-0 top-0 w-[380px] pointer-events-none z-20"
      style={{
        height: canvasHeight,
        filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.2))",
        opacity: active ? 1 : 0,
      }}
      aria-hidden
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 10], zoom: UNIT_PX }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        style={{ width: RECEIPT_W_PX, height: canvasHeight }}
      >
        <PrintedReceiptMesh
          receipt={receipt}
          active={active}
          canvasHeight={canvasHeight}
          onReady={onReady}
          onComplete={onComplete}
        />
      </Canvas>
    </div>
  );
}

function PrintedReceiptMesh({
  receipt,
  active,
  canvasHeight,
  onReady,
  onComplete,
}: {
  receipt: AnyReceipt;
  active: boolean;
  canvasHeight: number;
  onReady: () => void;
  onComplete: () => void;
}) {
  const textureData = useReceiptTexture(receipt);
  const meshRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const elapsed = useRef(0);
  const readyCalled = useRef(false);
  const completeCalled = useRef(false);

  const aspect = textureData ? textureData.height / textureData.width : 2.1;
  const height = RECEIPT_W * aspect;
  const receiptHeightPx = height * UNIT_PX;
  const startY = (canvasHeight / 2 - receiptHeightPx / 2) / UNIT_PX;
  const endY =
    (canvasHeight / 2 - (PRINTER_TO_STACK_OFFSET + receiptHeightPx / 2)) /
    UNIT_PX;
  // Stable nodes — stepPaperPhysics keeps restY in sync with current height.
  const nodes = useMemo(() => createPaperNodes(height), []);

  useEffect(() => {
    if (!textureData || readyCalled.current) return;
    readyCalled.current = true;
    onReady();
  }, [onReady, textureData]);

  useEffect(() => {
    if (!active) return;
    elapsed.current = 0;
    completeCalled.current = false;
  }, [active]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !active) return;

    elapsed.current += delta;
    const rawProgress = Math.min(elapsed.current / LANDING_DURATION, 1);
    const progress = easeOutCubic(rawProgress);
    const settle = Math.sin(progress * Math.PI) * 0.16;

    mesh.position.y = startY + (endY - startY) * progress;
    mesh.position.z = Math.sin(progress * Math.PI) * 0.28;
    mesh.rotation.x = THREE.MathUtils.degToRad(-8 * (1 - progress) + settle * 8);
    mesh.rotation.z = THREE.MathUtils.degToRad(receipt.rotation - 1 + progress);

    stepPaperPhysics({
      geometry: mesh.geometry,
      nodes,
      height,
      delta,
      grabFraction: 0.18,
      dragSpeed: (1 - progress) * 0.85,
      isDragging: rawProgress < 0.95,
    });

    if (rawProgress >= 1 && !completeCalled.current) {
      completeCalled.current = true;
      onComplete();
    }
  });

  if (!textureData) return null;

  return (
    <mesh ref={meshRef} position={[0, startY, 0]}>
      <planeGeometry args={[RECEIPT_W, height, SEG_X, SEG_Y]} />
      <meshBasicMaterial
        map={textureData.texture}
        color="#ffffff"
        side={THREE.FrontSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}
