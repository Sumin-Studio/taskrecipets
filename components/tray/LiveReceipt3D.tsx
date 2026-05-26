"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { computeSquares, type TimelineEntry } from "@/lib/computeSquares";
import type { AnyReceipt, CutReceiptSnapshot } from "@/lib/store";
import { PRINTER_TO_STACK_OFFSET } from "@/lib/trayLayout";
import {
  createPaperNodes,
  RECEIPT_W,
  SEG_X,
  SEG_Y,
  stepPaperPhysics,
} from "@/components/session/three/paperPhysics";
import { useReceiptElementTexture } from "@/components/session/three/useReceiptTexture";
import { ReceiptPrintStrip } from "./ReceiptPrintStrip";
import {
  RECEIPT_CUT_DELAY_MS,
  RECEIPT_PRINT_REVEAL_MS,
} from "./ReceiptPrintReveal";

const RECEIPT_W_PX = 380;
const STACK_H = 560;
const UNIT_PX = 100;
const LANDING_DURATION = 1.25;
const CUT_DURATION = 0.22;
const REVEAL_DURATION = RECEIPT_PRINT_REVEAL_MS / 1000;
const CUT_DELAY_DURATION = RECEIPT_CUT_DELAY_MS / 1000;
const REVEAL_ALL_CLIP = 999;

export type LiveReceipt3DState = {
  phase: "live" | "frozen" | "cut";
  taskId: string;
  taskTitle: string;
  taskStartedAt: number;
  timeline: TimelineEntry[];
  upToTs: number;
  textureKey: string;
  squares?: CutReceiptSnapshot["squares"];
  photoDataUrl?: string | null;
  printedAt?: number;
};

export function LiveReceipt3D({
  receiptState,
  onComplete,
}: {
  receiptState: LiveReceipt3DState;
  onComplete: () => void;
}) {
  const canvasHeight = STACK_H + PRINTER_TO_STACK_OFFSET;
  const showPrintedHeader = receiptState.phase === "cut";
  const completeCalledKey = useRef<string | null>(null);

  const captureElement = useMemo(
    () => (
      <ReceiptPrintStrip
        taskStartedAt={receiptState.taskStartedAt}
        timeline={receiptState.timeline}
        upToTs={receiptState.upToTs}
        squares={receiptState.squares}
        feedFromPrinter
        showTearTop={receiptState.phase === "cut"}
        photoDataUrl={showPrintedHeader ? receiptState.photoDataUrl : null}
        taskTitle={showPrintedHeader ? receiptState.taskTitle : undefined}
        printedAt={showPrintedHeader ? receiptState.printedAt : undefined}
        className="shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
      />
    ),
    [receiptState, showPrintedHeader],
  );

  const fallbackReceipt = useMemo<AnyReceipt>(
    () => ({
      kind: "task",
      id: `live-${receiptState.taskId}`,
      sourceTaskId: receiptState.taskId,
      number: 0,
      printedAt: receiptState.printedAt ?? receiptState.upToTs,
      rotation: 0,
      taskTitle: receiptState.taskTitle,
      taskStartedAt: receiptState.taskStartedAt,
      taskCompletedAt: receiptState.upToTs,
      dayCounter: 0,
      timeline: receiptState.timeline,
      squares:
        receiptState.squares ??
        computeSquares(
          receiptState.taskStartedAt,
          receiptState.timeline,
          receiptState.upToTs,
        ),
      photoDataUrl: receiptState.photoDataUrl ?? null,
      totalActiveMs: 0,
      totalBreakMs: 0,
      breakCount: 0,
      motto: "",
    }),
    [receiptState],
  );

  const textureData = useReceiptElementTexture({
    element: captureElement,
    textureKey: receiptState.textureKey,
    fallbackReceipt,
    keepPrevious: true,
    preferFallback: true,
    fallbackHeader: showPrintedHeader,
  });
  const hasTexture = Boolean(textureData);

  const finish = useCallback(() => {
    if (completeCalledKey.current === receiptState.textureKey) return;
    completeCalledKey.current = receiptState.textureKey;
    onComplete();
  }, [onComplete, receiptState.textureKey]);

  return (
    <div className="relative w-[380px]">
      <div
        className="absolute left-0 top-0 w-[380px] pointer-events-none z-20"
        style={{
          height: canvasHeight,
          filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.2))",
          opacity: hasTexture ? 1 : 0,
        }}
        aria-hidden
      >
        <Canvas
          orthographic
          camera={{ position: [0, 0, 10], zoom: UNIT_PX }}
          gl={{ antialias: true, alpha: true }}
          onCreated={({ gl }) => {
            gl.localClippingEnabled = true;
          }}
          dpr={[1, 2]}
          style={{ width: RECEIPT_W_PX, height: canvasHeight }}
        >
          <LiveReceiptMesh
            receiptState={receiptState}
            canvasHeight={canvasHeight}
            textureData={textureData}
            onComplete={finish}
          />
        </Canvas>
      </div>

      <div className={hasTexture ? "opacity-0" : ""}>
        <ReceiptPrintStrip
          taskStartedAt={receiptState.taskStartedAt}
          timeline={receiptState.timeline}
          upToTs={receiptState.upToTs}
          squares={receiptState.squares}
          feedFromPrinter
          animate={receiptState.phase === "live"}
          showTearTop={receiptState.phase === "cut"}
          photoDataUrl={showPrintedHeader ? receiptState.photoDataUrl : null}
          taskTitle={showPrintedHeader ? receiptState.taskTitle : undefined}
          printedAt={showPrintedHeader ? receiptState.printedAt : undefined}
          className="shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
        />
      </div>
    </div>
  );
}

function LiveReceiptMesh({
  receiptState,
  canvasHeight,
  textureData,
  onComplete,
}: {
  receiptState: LiveReceipt3DState;
  canvasHeight: number;
  textureData: ReturnType<typeof useReceiptElementTexture>;
  onComplete: () => void;
}) {
  const meshRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const cutLineRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const clipPlaneRef = useRef(
    new THREE.Plane(new THREE.Vector3(0, -1, 0), REVEAL_ALL_CLIP),
  );
  const phaseElapsed = useRef(0);
  const cutElapsed = useRef(0);
  const fallElapsed = useRef(0);
  const completeCalled = useRef(false);

  const aspect = textureData ? textureData.height / textureData.width : 2.1;
  const height = RECEIPT_W * aspect;
  const receiptHeightPx = height * UNIT_PX;
  const startY = (canvasHeight / 2 - receiptHeightPx / 2) / UNIT_PX;
  const endY = startY - PRINTER_TO_STACK_OFFSET / UNIT_PX;
  // Stable nodes — stepPaperPhysics keeps restY in sync with current height,
  // so spring state survives the per-minute texture/height refresh.
  const nodes = useMemo(() => createPaperNodes(height), []);
  const textureIsCurrent = textureData?.key === receiptState.textureKey;

  useEffect(() => {
    phaseElapsed.current = 0;
    cutElapsed.current = 0;
    fallElapsed.current = 0;
    completeCalled.current = false;
    if (cutLineRef.current) cutLineRef.current.scale.x = 0.001;
    if (meshRef.current) {
      meshRef.current.position.y = startY;
      meshRef.current.position.z = 0;
      meshRef.current.rotation.set(THREE.MathUtils.degToRad(-5), 0, 0);
    }
    clipPlaneRef.current.constant = REVEAL_ALL_CLIP;
    if (materialRef.current) {
      materialRef.current.clippingPlanes = [clipPlaneRef.current];
      materialRef.current.needsUpdate = true;
    }
  }, [receiptState.textureKey, startY]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !textureData) return;

    const line = cutLineRef.current;
    const isCutting = receiptState.phase === "cut" && textureIsCurrent;

    if (!isCutting) {
      mesh.position.y = startY;
      mesh.position.z = 0;
      mesh.rotation.x = THREE.MathUtils.degToRad(-5);
      mesh.rotation.z = THREE.MathUtils.degToRad(
        receiptState.phase === "live" ? -0.8 : 0,
      );
      if (line) line.scale.x = 0.001;
      clipPlaneRef.current.constant = REVEAL_ALL_CLIP;
      stepPaperPhysics({
        geometry: mesh.geometry,
        nodes,
        height,
        delta,
        grabFraction: 0.08,
        dragSpeed: receiptState.phase === "live" ? 0.18 : 0,
        isDragging: receiptState.phase === "live",
      });
      return;
    }

    phaseElapsed.current += delta;
    const revealProgress = easeInOutCubic(
      Math.min(phaseElapsed.current / REVEAL_DURATION, 1),
    );
    const printerSlotY = startY + height / 2;
    clipPlaneRef.current.constant =
      revealProgress >= 0.995 ? REVEAL_ALL_CLIP : printerSlotY;

    mesh.position.y = startY + height * (1 - revealProgress);
    mesh.position.z = 0.06 * revealProgress;
    mesh.rotation.x = THREE.MathUtils.degToRad(-5);
    mesh.rotation.z = THREE.MathUtils.degToRad(-0.4 * revealProgress);

    if (phaseElapsed.current < REVEAL_DURATION + CUT_DELAY_DURATION) {
      if (line) line.scale.x = 0.001;
      stepPaperPhysics({
        geometry: mesh.geometry,
        nodes,
        height,
        delta,
        grabFraction: 0.1,
        dragSpeed: 0.12,
        isDragging: true,
      });
      return;
    }

    cutElapsed.current = Math.min(cutElapsed.current + delta, CUT_DURATION);
    const cutProgress = easeOutCubic(cutElapsed.current / CUT_DURATION);
    if (line) line.scale.x = Math.max(0.001, cutProgress);

    if (cutProgress < 1) {
      mesh.position.y = startY;
      mesh.rotation.x = THREE.MathUtils.degToRad(-5);
      return;
    }

    fallElapsed.current += delta;
    const rawFallProgress = Math.min(fallElapsed.current / LANDING_DURATION, 1);
    const fallProgress = easeOutCubic(rawFallProgress);
    const lift = Math.sin(fallProgress * Math.PI);

    mesh.position.y = startY + (endY - startY) * fallProgress;
    mesh.position.z = 0.08 + lift * 0.46 - fallProgress * 0.12;
    mesh.rotation.x = THREE.MathUtils.degToRad(-7 + lift * 10 + fallProgress * 3);
    mesh.rotation.z = THREE.MathUtils.degToRad(-0.8 + lift * 4 - fallProgress * 1.2);

    stepPaperPhysics({
      geometry: mesh.geometry,
      nodes,
      height,
      delta,
      grabFraction: 0.18,
      dragSpeed: (1 - fallProgress) * 0.85 + 0.08,
      isDragging: rawFallProgress < 0.96,
    });

    if (rawFallProgress >= 1 && !completeCalled.current) {
      completeCalled.current = true;
      onComplete();
    }
  });

  if (!textureData) return null;

  return (
    <mesh ref={meshRef} position={[0, startY, 0]}>
      <planeGeometry args={[RECEIPT_W, height, SEG_X, SEG_Y]} />
      <meshBasicMaterial
        ref={materialRef}
        map={textureData.texture}
        color="#ffffff"
        side={THREE.FrontSide}
        toneMapped={false}
      />
      <mesh ref={cutLineRef} position={[0, height / 2 - 0.02, 0.015]} scale={[0.001, 1, 1]}>
        <planeGeometry args={[RECEIPT_W, 0.012]} />
        <meshBasicMaterial
          color="#2a2a2a"
          transparent
          opacity={0.28}
          toneMapped={false}
        />
      </mesh>
    </mesh>
  );
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}
