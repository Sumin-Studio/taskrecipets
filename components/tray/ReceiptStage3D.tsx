"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { computeSquares, MS_PER_MIN } from "@/lib/computeSquares";
import type { AnyReceipt, CutReceiptSnapshot } from "@/lib/store";
import { useStore } from "@/lib/store";
import { PRINTER_TO_STACK_OFFSET } from "@/lib/trayLayout";
import { useTimerTick } from "@/lib/useTimerTick";
import {
  createPaperNodes,
  clamp01,
  RECEIPT_W,
  SEG_X,
  SEG_Y,
  stepPaperPhysics,
} from "@/components/session/three/paperPhysics";
import {
  type ReceiptTexture,
  useReceiptElementTexture,
  useReceiptTexture,
} from "@/components/session/three/useReceiptTexture";
import { playCutSound, startPrintingLoop } from "@/lib/soundEffects";
import { ReceiptPrintStrip } from "./ReceiptPrintStrip";
import {
  RECEIPT_CUT_DELAY_MS,
  RECEIPT_PRINT_REVEAL_MS,
} from "./ReceiptPrintReveal";

const STACK_H_PX = 560;
const UNIT_PX = 100;
const DEFAULT_STAGE_W_PX = 720;
const DEFAULT_STAGE_H_PX = STACK_H_PX + PRINTER_TO_STACK_OFFSET;
const CAMERA_Z = 10;
const PRINT_Z = 1.4;
const STACK_Z = -2.2;
const PRINT_TOP_PADDING = 0.1;
const LANDING_DURATION = 1.25;
const CUT_DURATION = 0.22;
const REVEAL_DURATION = RECEIPT_PRINT_REVEAL_MS / 1000;
const CUT_DELAY_DURATION = RECEIPT_CUT_DELAY_MS / 1000;
const REVEAL_ALL_CLIP = 999;
const STACK_Y_STEP = 0.105;
const STACK_Z_STEP = 0.16;
const STACK_TOP_Z_CLEARANCE = 0.26;
const DROP_Z_STEP = 0.32;
const MAX_DROP_Z_LAYERS = 4;
const TOP_DROP_Z_OFFSET = DROP_Z_STEP * MAX_DROP_Z_LAYERS;
const TOP_LAYER_Z_STEP = 0.08;
const STACK_X_STEP = 0.012;
const STACK_SCALE_STEP = 0.0045;
const DRAG_Z = PRINT_Z + 0.8;
const DRAG_X_LIMIT = 2.8;
const DRAG_Y_MIN = -3.4;
const DRAG_Y_MAX = 2.8;
const RELEASE_DROP_DURATION = 0.8;
const RELEASE_UNBEND_DECAY = 0.82;
/** Baseline sag from gravity while the user is holding a receipt — applied on
 *  pointer-down so the paper droops immediately, before any movement. Motion
 *  velocity can push it higher. */
const PICKUP_SAG = 0.9;

/** Distance-aware drop shadow. Each receipt gets a soft radial blob behind it
 *  whose size, opacity, and offset track how far it sits above STACK_Z — the
 *  conceptual "tray surface" depth. A receipt at rest casts a tight, darker
 *  shadow; a lifted receipt casts a wide, faded, lower-offset one. */
/** Just-behind offset — keeps the shadow plane in front of every receipt
 *  deeper in the stack (so its dark falloff can blend onto them) while sitting
 *  just behind its own receipt's body. This offset leaves
 *  plenty of room for stacked receipts to depth-test correctly. */
/** Fixed Z offset, large enough to sit behind the paper's maximum backward
 *  bend (~0.6 world units at full PICKUP_SAG) plus settling overshoot. With a
 *  fixed offset the blob never bleeds through the paper — no black bars during
 *  drop/oscillation. The paper's own self-shadow (vertex colors in
 *  stepPaperPhysics) handles shading on the receipt itself. */
const SHADOW_Z_OFFSET = 0.85;
const SHADOW_HEIGHT_RANGE = 3.8; // STACK_Z → DRAG_Z lift span
// Subtle drop shadow — the lit material does most of the shadow work on the
// receipt itself; this blob only provides a hint of contact grounding.
const SHADOW_BASE_OPACITY = 0.22;
const SHADOW_FAR_OPACITY = 0.12;
const SHADOW_BASE_SCALE = 0.95;
const SHADOW_FAR_SCALE = 1.45;
const SHADOW_BASE_Y_DROP = 0.1;
const SHADOW_FAR_Y_DROP = 0.32;
const SHADOW_PLANE_W_MULT = 1.18;
const SHADOW_PLANE_H_MULT = 1.22;
const EDGE_SHADOW_W_MULT = 1.02;
const EDGE_SHADOW_H = 0.28;
const EDGE_SHADOW_Z_OFFSET = 0.08;
const EDGE_SHADOW_Y_OFFSET = 0.025;
const EDGE_SHADOW_OPACITY = 0.42;

const SHADOW_BLOB_TEXTURE: THREE.CanvasTexture | null = (() => {
  if (typeof document === "undefined") return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cx = size / 2;
  const cy = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  gradient.addColorStop(0, "rgba(0,0,0,0.85)");
  gradient.addColorStop(0.25, "rgba(0,0,0,0.55)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.18)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
})();

function updateShadowFromPosition(
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
  receiptX: number,
  receiptY: number,
  receiptZ: number,
  rotationZ: number,
) {
  const heightAbove = Math.max(0, receiptZ - STACK_Z);
  const t = clamp01(heightAbove / SHADOW_HEIGHT_RANGE);
  const scale = THREE.MathUtils.lerp(SHADOW_BASE_SCALE, SHADOW_FAR_SCALE, t);
  const opacity = THREE.MathUtils.lerp(
    SHADOW_BASE_OPACITY,
    SHADOW_FAR_OPACITY,
    t,
  );
  const drop = THREE.MathUtils.lerp(SHADOW_BASE_Y_DROP, SHADOW_FAR_Y_DROP, t);
  shadow.position.set(receiptX, receiptY - drop, receiptZ - SHADOW_Z_OFFSET);
  shadow.rotation.set(0, 0, rotationZ);
  shadow.scale.set(scale, scale, 1);
  shadow.material.opacity = opacity;
}

function updateBottomEdgeShadowFromPosition(
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
  receiptX: number,
  receiptY: number,
  receiptZ: number,
  rotationZ: number,
  height: number,
  scale: number,
) {
  const bottomDistance = height * scale * 0.5 + EDGE_SHADOW_Y_OFFSET;
  const offsetX = Math.sin(rotationZ) * bottomDistance;
  const offsetY = -Math.cos(rotationZ) * bottomDistance;

  shadow.position.set(
    receiptX + offsetX,
    receiptY + offsetY,
    receiptZ - EDGE_SHADOW_Z_OFFSET,
  );
  shadow.rotation.set(0, 0, rotationZ);
  shadow.scale.set(scale, scale, 1);
}

const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const pointerWorld = new THREE.Vector3();

function clearPointerDrag(
  canvas: HTMLCanvasElement,
  isDragging: MutableRefObject<boolean>,
  activePointerId: MutableRefObject<number | null>,
  pointerId = activePointerId.current,
) {
  isDragging.current = false;
  if (pointerId != null) {
    try {
      if (canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // Pointer capture can already be gone if the browser released it outside
      // the canvas. The important part is clearing local drag state.
    }
  }
  if (pointerId == null || activePointerId.current === pointerId) {
    activePointerId.current = null;
  }
}

function usePointerReleaseGuard(
  canvas: HTMLCanvasElement,
  isDragging: MutableRefObject<boolean>,
  activePointerId: MutableRefObject<number | null>,
  onRelease?: () => void,
) {
  const onReleaseRef = useRef(onRelease);

  useEffect(() => {
    onReleaseRef.current = onRelease;
  }, [onRelease]);

  useEffect(() => {
    const clearActiveDrag = (pointerId = activePointerId.current) => {
      if (!isDragging.current) return;
      onReleaseRef.current?.();
      clearPointerDrag(canvas, isDragging, activePointerId, pointerId);
    };

    const handlePointerRelease = (event: PointerEvent) => {
      if (
        activePointerId.current == null ||
        activePointerId.current === event.pointerId
      ) {
        clearActiveDrag(event.pointerId);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (
        activePointerId.current === event.pointerId &&
        event.buttons === 0
      ) {
        clearActiveDrag(event.pointerId);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") clearActiveDrag();
    };
    const handleBlur = () => clearActiveDrag();

    window.addEventListener("pointerup", handlePointerRelease, true);
    window.addEventListener("pointercancel", handlePointerRelease, true);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointerup", handlePointerRelease, true);
      window.removeEventListener("pointercancel", handlePointerRelease, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activePointerId, canvas, isDragging]);
}

type ReceiptController = "printer" | "resting";

export type StageReceiptState = {
  phase: "live" | "frozen" | "cut";
  taskId: string;
  taskTitle: string;
  taskStartedAt: number;
  timeline: CutReceiptSnapshot["timeline"];
  upToTs: number;
  textureKey: string;
  squares?: CutReceiptSnapshot["squares"];
  photoDataUrl?: string | null;
  printedAt?: number;
};

export type ReceiptStageDemoAdapter = {
  receipts: AnyReceipt[];
  activeReceiptState: StageReceiptState | null;
  onLanded: (receiptState: StageReceiptState) => string;
};

type LandedVisual = {
  visualId: string;
  receiptId: string | null;
  receiptState: StageReceiptState;
  textureData?: ReceiptTexture;
  stackIndex: number;
};

type StackTransform = {
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationZ: number;
  scale: number;
};

type VisualPlacement = {
  x: number;
  y: number;
  zOffset?: number;
};

function getStackItemKey(kind: "landed" | "saved", id: string) {
  return `${kind}:${id}`;
}

export function buildLiveStageReceiptState({
  taskId,
  taskTitle,
  taskStartedAt,
  timeline,
  liveNow,
  keyPrefix = "live",
}: {
  taskId: string;
  taskTitle: string;
  taskStartedAt: number;
  timeline: CutReceiptSnapshot["timeline"];
  liveNow: number;
  keyPrefix?: string;
}): StageReceiptState {
  const elapsedMs = Math.max(1, liveNow - taskStartedAt);
  const minuteBucket = Math.floor(elapsedMs / MS_PER_MIN);
  const latestTimelineTs =
    timeline.length > 0
      ? Math.max(...timeline.map((entry) => entry.ts))
      : taskStartedAt;
  const textureUpToTs = Math.min(
    liveNow,
    Math.max(
      taskStartedAt + minuteBucket * MS_PER_MIN + 1,
      latestTimelineTs + 1,
      taskStartedAt + 1,
    ),
  );
  const timelineKey = timeline
    .map((entry) => `${entry.ts}-${entry.mode}`)
    .join(",");

  return {
    phase: "live",
    taskId,
    taskTitle,
    taskStartedAt,
    timeline,
    upToTs: textureUpToTs,
    textureKey: [keyPrefix, taskId, minuteBucket, timelineKey].join(":"),
  };
}

export function ReceiptStage3D({
  stageWidthPx = DEFAULT_STAGE_W_PX,
  stageHeightPx = DEFAULT_STAGE_H_PX,
  stageContentTopPx = 0,
  demo,
}: {
  stageWidthPx?: number;
  stageHeightPx?: number;
  stageContentTopPx?: number;
  demo?: ReceiptStageDemoAdapter;
}) {
  const now = useTimerTick();
  const currentTaskId = useStore((s) => s.currentTaskId);
  const tasks = useStore((s) => s.tasks);
  const storeReceipts = useStore((s) => s.receipts);
  const cutReceipt = useStore((s) => s.cutReceipt);
  const finalizeComplete = useStore((s) => s.finalizeComplete);
  const clearLandingReceipt = useStore((s) => s.clearLandingReceipt);
  const soundOn = useStore((s) => s.settings.soundOn);
  const [landedVisuals, setLandedVisuals] = useState<LandedVisual[]>([]);
  const [recentDropKeys, setRecentDropKeys] = useState<string[]>([]);
  const [manualPlacements, setManualPlacements] = useState<Record<string, VisualPlacement>>({});
  const visualTextureCache = useRef(new Map<string, ReceiptTexture>());

  useEffect(() => {
    const textureCache = visualTextureCache.current;
    return () => {
      textureCache.forEach((textureData) => {
        textureData.texture.dispose();
      });
      textureCache.clear();
    };
  }, []);

  const cacheVisualTexture = useCallback(
    (visualId: string | null, textureData: ReceiptTexture | null) => {
      if (!visualId || !textureData) return;
      const cloned = cloneReceiptTexture(textureData);
      if (!cloned) return;
      const previous = visualTextureCache.current.get(visualId);
      previous?.texture.dispose();
      visualTextureCache.current.set(visualId, cloned);
    },
    [],
  );

  const storeActiveReceiptState = useMemo(() => {
    if (cutReceipt) {
      const cutTask = tasks.find((task) => task.id === cutReceipt.taskId);
      return {
        phase: cutReceipt.isCut ? "cut" : "frozen",
        taskId: cutReceipt.taskId,
        taskTitle: cutTask?.title ?? "Receipt",
        taskStartedAt: cutReceipt.taskStartedAt,
        timeline: cutReceipt.timeline,
        upToTs: cutReceipt.frozenAt,
        textureKey: [
          "cut",
          cutReceipt.taskId,
          cutReceipt.frozenAt,
          cutReceipt.isCut ? "ready" : "frozen",
          cutReceipt.photoDataUrl ?? "no-photo",
        ].join(":"),
        squares: cutReceipt.squares,
        photoDataUrl: cutReceipt.photoDataUrl,
        printedAt: cutReceipt.frozenAt,
      } satisfies StageReceiptState;
    }

    const task = tasks.find((item) => item.id === currentTaskId);
    if (!task?.taskStartedAt) return null;

    const liveNow = now ?? task.taskStartedAt + 1;
    return buildLiveStageReceiptState({
      taskId: task.id,
      taskTitle: task.title,
      taskStartedAt: task.taskStartedAt,
      timeline: task.timeline,
      liveNow,
    });
  }, [currentTaskId, cutReceipt, now, tasks]);

  const activeReceiptState = demo?.activeReceiptState ?? storeActiveReceiptState;
  const receipts = demo?.receipts ?? storeReceipts;

  const landedReceiptIds = useMemo(
    () =>
      new Set(
        landedVisuals
          .map((visual) => visual.receiptId)
          .filter((receiptId): receiptId is string => Boolean(receiptId)),
      ),
    [landedVisuals],
  );
  const landedTaskIds = useMemo(
    () => new Set(landedVisuals.map((visual) => visual.receiptState.taskId)),
    [landedVisuals],
  );
  const savedReceipts = useMemo(
    () =>
      [...receipts]
        .slice(-12)
        .reverse()
        .filter((receipt) => {
          if (landedReceiptIds.has(receipt.id)) return false;
          if (receipt.kind !== "session" && landedTaskIds.has(receipt.sourceTaskId)) {
            return false;
          }
          return true;
        }),
    [landedReceiptIds, landedTaskIds, receipts],
  );

  const handleReceiptDropped = useCallback(
    (stackKey: string, placement?: VisualPlacement) => {
      const nextDropKeys = [
        stackKey,
        ...recentDropKeys.filter((previousKey) => previousKey !== stackKey),
      ].slice(0, MAX_DROP_Z_LAYERS);

      setRecentDropKeys(nextDropKeys);
      if (placement) {
        setManualPlacements((previous) => ({
          ...normalizeManualPlacements(previous, nextDropKeys),
          [stackKey]: { ...placement, zOffset: getDropSlotZOffset(0) },
        }));
      }
    },
    [recentDropKeys],
  );

  const handleLanded = useCallback(
    (receiptState: StageReceiptState, placement?: VisualPlacement) => {
      const visualId = makeVisualId(receiptState);
      const stackKey = getStackItemKey("landed", visualId);
      const textureData = visualTextureCache.current.get(visualId);

      setLandedVisuals((previous) => {
        if (previous.some((visual) => visual.visualId === visualId)) {
          return previous;
        }
        return [
          ...previous,
          { visualId, receiptId: null, receiptState, textureData, stackIndex: 0 },
        ];
      });

      const receiptId = demo
        ? demo.onLanded(receiptState)
        : (() => {
            finalizeComplete(receiptState.photoDataUrl ?? null);
            const id = useStore.getState().landingReceiptId;
            clearLandingReceipt();
            return id;
          })();

      handleReceiptDropped(stackKey, placement);

      setLandedVisuals((previous) =>
        previous.map((visual) =>
          visual.visualId === visualId ? { ...visual, receiptId } : visual,
        ),
      );
    },
    [clearLandingReceipt, demo, finalizeComplete, handleReceiptDropped],
  );

  const activeVisualId = activeReceiptState ? makeVisualId(activeReceiptState) : null;
  const activeAlreadyLanded = activeVisualId
    ? landedVisuals.some((visual) => visual.visualId === activeVisualId)
    : false;
  const cameraFov = useMemo(() => getCameraFov(stageHeightPx), [stageHeightPx]);
  const getDropZOffset = useCallback(
    (stackKey: string) => {
      return recentDropKeys.includes(stackKey) ? TOP_DROP_Z_OFFSET : 0;
    },
    [recentDropKeys],
  );
  const activePrintSoundKey =
    activeReceiptState?.phase === "cut" ? activeReceiptState.textureKey : null;

  useEffect(() => {
    if (!soundOn || !activePrintSoundKey) return;

    const stopPrinting = startPrintingLoop();
    let stoppedPrinting = false;
    const stopPrintSound = () => {
      if (stoppedPrinting) return;
      stoppedPrinting = true;
      stopPrinting();
    };
    const printStopTimer = window.setTimeout(
      stopPrintSound,
      RECEIPT_PRINT_REVEAL_MS + RECEIPT_CUT_DELAY_MS,
    );
    const cutTimer = window.setTimeout(() => {
      stopPrintSound();
      playCutSound();
    }, RECEIPT_PRINT_REVEAL_MS + RECEIPT_CUT_DELAY_MS);

    return () => {
      window.clearTimeout(printStopTimer);
      window.clearTimeout(cutTimer);
      stopPrintSound();
    };
  }, [activePrintSoundKey, soundOn]);

  return (
    <div
      className="receipt-stage-shell relative"
      style={{
        width: stageWidthPx,
        height: stageHeightPx,
        // Minimal ambient grounding only — per-receipt shadows do the heavy
        // lifting now (see SHADOW_BLOB_TEXTURE / updateShadowFromPosition).
        filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.06))",
      }}
      aria-hidden
    >
      <Canvas
        camera={{
          position: [0, 0, CAMERA_Z],
          fov: cameraFov,
          near: 0.1,
          far: 60,
        }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          gl.domElement.style.setProperty("width", "100%", "important");
          gl.domElement.style.setProperty("height", "100%", "important");
        }}
        dpr={[1, 2]}
        style={{ width: "100%", height: "100%" }}
      >
        {savedReceipts.map((receipt, index) => {
          const stackKey = getStackItemKey("saved", receipt.id);
          return (
            <SavedReceiptMesh
              key={receipt.id}
              receipt={receipt}
              stackIndex={index}
              placement={manualPlacements[stackKey]}
              dropZOffset={manualPlacements[stackKey]?.zOffset ?? getDropZOffset(stackKey)}
              onDropped={(placement) => handleReceiptDropped(stackKey, placement)}
              stageHeightPx={stageHeightPx}
              stageContentTopPx={stageContentTopPx}
              cameraFov={cameraFov}
            />
          );
        })}

        {landedVisuals.map((visual) => {
          const stackKey = getStackItemKey("landed", visual.visualId);
          return (
            <LiveStageReceiptMesh
              key={visual.visualId}
              receiptState={visual.receiptState}
              initialTextureData={visual.textureData}
              controller="resting"
              stackIndex={visual.stackIndex}
              placement={manualPlacements[stackKey]}
              dropZOffset={manualPlacements[stackKey]?.zOffset ?? getDropZOffset(stackKey)}
              onDropped={(placement) => handleReceiptDropped(stackKey, placement)}
              onLanded={handleLanded}
              stageHeightPx={stageHeightPx}
              stageContentTopPx={stageContentTopPx}
              cameraFov={cameraFov}
            />
          );
        })}

        {activeReceiptState && !activeAlreadyLanded ? (
          <LiveStageReceiptMesh
            key={activeVisualId}
            receiptState={activeReceiptState}
            controller="printer"
            stackIndex={0}
            dropZOffset={TOP_DROP_Z_OFFSET}
            onDropped={() => {}}
            onLanded={handleLanded}
            onTextureReady={(textureData) => cacheVisualTexture(activeVisualId, textureData)}
            stageHeightPx={stageHeightPx}
            stageContentTopPx={stageContentTopPx}
            cameraFov={cameraFov}
          />
        ) : null}
      </Canvas>
    </div>
  );
}

function LiveStageReceiptMesh({
  receiptState,
  initialTextureData,
  controller,
  stackIndex,
  placement,
  dropZOffset,
  onDropped,
  onLanded,
  onTextureReady,
  stageHeightPx,
  stageContentTopPx,
  cameraFov,
}: {
  receiptState: StageReceiptState;
  initialTextureData?: ReceiptTexture;
  controller: ReceiptController;
  stackIndex: number;
  placement?: VisualPlacement;
  dropZOffset: number;
  onDropped: (placement?: VisualPlacement) => void;
  onLanded: (receiptState: StageReceiptState, placement?: VisualPlacement) => void;
  onTextureReady?: (textureData: ReceiptTexture | null) => void;
  stageHeightPx: number;
  stageContentTopPx: number;
  cameraFov: number;
}) {
  const showPrintedHeader = receiptState.phase === "cut";
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

  const generatedTextureData = useReceiptElementTexture({
    element: captureElement,
    textureKey: receiptState.textureKey,
    fallbackReceipt,
    keepPrevious: true,
    preferFallback: true,
    fallbackHeader: showPrintedHeader,
  });
  const textureData = generatedTextureData ?? initialTextureData ?? null;

  useEffect(() => {
    onTextureReady?.(generatedTextureData);
  }, [generatedTextureData, onTextureReady]);

  return (
    <ReceiptPaperMesh
      textureData={textureData}
      receiptState={receiptState}
      controller={controller}
      stackIndex={stackIndex}
      placement={placement}
      dropZOffset={dropZOffset}
      onDropped={onDropped}
      onLanded={onLanded}
      stageHeightPx={stageHeightPx}
      stageContentTopPx={stageContentTopPx}
      cameraFov={cameraFov}
    />
  );
}

function ReceiptPaperMesh({
  textureData,
  receiptState,
  controller,
  stackIndex,
  placement,
  dropZOffset,
  onDropped,
  onLanded,
  stageHeightPx,
  stageContentTopPx,
  cameraFov,
}: {
  textureData: ReceiptTexture | null;
  receiptState: StageReceiptState;
  controller: ReceiptController;
  stackIndex: number;
  placement?: VisualPlacement;
  dropZOffset: number;
  onDropped: (placement?: VisualPlacement) => void;
  onLanded: (receiptState: StageReceiptState, placement?: VisualPlacement) => void;
  stageHeightPx: number;
  stageContentTopPx: number;
  cameraFov: number;
}) {
  const meshRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const cutLineRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const shadowRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const edgeShadowRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const clipPlaneRef = useRef(
    new THREE.Plane(new THREE.Vector3(0, -1, 0), REVEAL_ALL_CLIP),
  );
  const phaseElapsed = useRef(0);
  const cutElapsed = useRef(0);
  const fallElapsed = useRef(0);
  const completeCalled = useRef(false);
  const isDragging = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const wasDragged = useRef(false);
  const grabFraction = useRef(0.35);
  const dragOffset = useRef(new THREE.Vector3());
  const dragPlaneZ = useRef(STACK_Z);
  const lastPointerWorld = useRef(new THREE.Vector3());
  const dragSpeed = useRef(0);
  const releaseStartZ = useRef<number | null>(null);
  const releaseElapsed = useRef(0);
  const raycaster = useThree((state) => state.raycaster);
  const camera = useThree((state) => state.camera);
  const pointer = useThree((state) => state.pointer);
  const gl = useThree((state) => state.gl);
  const commitDrop = useCallback(() => {
    const mesh = meshRef.current;
    if (mesh) {
      releaseStartZ.current = mesh.position.z;
      releaseElapsed.current = 0;
    }
    onDropped(mesh ? { x: mesh.position.x, y: mesh.position.y } : undefined);
  }, [onDropped]);
  usePointerReleaseGuard(
    gl.domElement,
    isDragging,
    activePointerId,
    controller === "resting" ? commitDrop : undefined,
  );

  const aspect = textureData ? textureData.height / textureData.width : 2.1;
  const height = RECEIPT_W * aspect;
  const printY = getPrinterY(height, stageHeightPx, stageContentTopPx);
  const stackTransform = useMemo(
    () =>
      getStackTransform(
        height,
        stackIndex,
        0,
        stageHeightPx,
        cameraFov,
        stageContentTopPx,
      ),
    [cameraFov, height, stackIndex, stageContentTopPx, stageHeightPx],
  );
  const restingZ = getRestingStackZ(
    stackTransform,
    dropZOffset,
    Boolean(placement),
  );
  // Nodes are constructed once and persist for the life of this mesh. Spring
  // state (currentRotX, velocity) survives texture/height changes — see
  // stepPaperPhysics, which re-derives restY from the current height each
  // frame. Reallocating here would reset every row to flat and cause a visible
  // unbend/re-bend hiccup whenever a new square prints.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodes = useMemo(() => createPaperNodes(height), []);
  const textureIsCurrent = textureData?.key === receiptState.textureKey;

  useLayoutEffect(() => {
    phaseElapsed.current = 0;
    cutElapsed.current = 0;
    fallElapsed.current = 0;
    completeCalled.current = false;
    if (cutLineRef.current) cutLineRef.current.scale.x = 0.001;
    if (meshRef.current) {
      if (controller === "resting") {
        if (!wasDragged.current) {
          meshRef.current.position.set(
            placement?.x ?? stackTransform.x,
            placement?.y ?? stackTransform.y,
            restingZ,
          );
          meshRef.current.rotation.set(
            stackTransform.rotationX,
            0,
            stackTransform.rotationZ,
          );
          meshRef.current.scale.setScalar(stackTransform.scale);
        }
      } else {
        meshRef.current.position.set(0, printY, PRINT_Z);
        meshRef.current.rotation.set(THREE.MathUtils.degToRad(-5), 0, 0);
        meshRef.current.scale.setScalar(1);
      }
    }
    clipPlaneRef.current.constant = REVEAL_ALL_CLIP;
    if (materialRef.current) {
      materialRef.current.clippingPlanes = [clipPlaneRef.current];
      materialRef.current.needsUpdate = true;
    }
  }, [
    controller,
    placement,
    printY,
    receiptState.textureKey,
    restingZ,
    stackIndex,
    stackTransform,
  ]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !textureData) return;

    if (controller === "resting") {
      if (isDragging.current) {
        releaseStartZ.current = null;
        releaseElapsed.current = 0;
        dragPlane.constant = -dragPlaneZ.current;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.ray.intersectPlane(dragPlane, pointerWorld);

        if (hit) {
          const targetX = THREE.MathUtils.clamp(
            hit.x + dragOffset.current.x,
            -DRAG_X_LIMIT,
            DRAG_X_LIMIT,
          );
          const targetY = THREE.MathUtils.clamp(
            hit.y + dragOffset.current.y,
            DRAG_Y_MIN,
            DRAG_Y_MAX,
          );
          const dx = hit.x - lastPointerWorld.current.x;
          const dy = hit.y - lastPointerWorld.current.y;
          const velocity = Math.sqrt(dx * dx + dy * dy) / Math.max(delta, 0.001);
          dragSpeed.current = THREE.MathUtils.lerp(
            dragSpeed.current,
            Math.max(PICKUP_SAG, clamp01(velocity / 24)),
            0.3,
          );
          lastPointerWorld.current.copy(hit);

          mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, targetX, 0.24);
          mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, targetY, 0.24);
          mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, DRAG_Z, 0.18);
          mesh.rotation.x = THREE.MathUtils.lerp(
            mesh.rotation.x,
            THREE.MathUtils.degToRad(-4),
            0.12,
          );
          mesh.rotation.z = THREE.MathUtils.lerp(
            mesh.rotation.z,
            stackTransform.rotationZ + (targetX - mesh.position.x) * 0.04,
            0.12,
          );
        }
      } else {
        dragSpeed.current = THREE.MathUtils.lerp(
          dragSpeed.current,
          0,
          RELEASE_UNBEND_DECAY,
        );
        if (!wasDragged.current) {
          mesh.position.set(
            placement?.x ?? stackTransform.x,
            placement?.y ?? stackTransform.y,
            restingZ,
          );
          mesh.rotation.x = stackTransform.rotationX;
          mesh.rotation.z = stackTransform.rotationZ;
          mesh.scale.setScalar(stackTransform.scale);
        } else {
          const targetZ = getTopStackZ() + dropZOffset;
          if (releaseStartZ.current == null) {
            releaseStartZ.current = mesh.position.z;
            releaseElapsed.current = 0;
          }
          releaseElapsed.current = Math.min(
            releaseElapsed.current + delta,
            RELEASE_DROP_DURATION,
          );
          mesh.position.z = THREE.MathUtils.lerp(
            releaseStartZ.current,
            targetZ,
            easeInOutCubic(releaseElapsed.current / RELEASE_DROP_DURATION),
          );
          mesh.rotation.x = THREE.MathUtils.lerp(
            mesh.rotation.x,
            stackTransform.rotationX,
            0.08,
          );
          mesh.rotation.z = THREE.MathUtils.lerp(
            mesh.rotation.z,
            stackTransform.rotationZ,
            0.08,
          );
          mesh.scale.setScalar(stackTransform.scale);
        }
      }
      clipPlaneRef.current.constant = REVEAL_ALL_CLIP;
      stepPaperPhysics({
        geometry: mesh.geometry,
        nodes,
        height,
        delta,
        grabFraction: grabFraction.current,
        dragSpeed: Math.max(dragSpeed.current, 0.03),
        isDragging: isDragging.current,
      });
      return;
    }

    const line = cutLineRef.current;
    const isCutting = receiptState.phase === "cut" && textureIsCurrent;

    if (!isCutting) {
      mesh.position.y = printY;
      mesh.position.z = PRINT_Z;
      mesh.position.x = 0;
      mesh.scale.setScalar(1);
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
        dragSpeed: receiptState.phase === "live" ? PICKUP_SAG : 0,
        isDragging: receiptState.phase === "live",
      });
      return;
    }

    phaseElapsed.current += delta;
    const revealProgress = easeInOutCubic(
      Math.min(phaseElapsed.current / REVEAL_DURATION, 1),
    );
    const printerSlotY = printY + height / 2;
    clipPlaneRef.current.constant =
      revealProgress >= 0.995 ? REVEAL_ALL_CLIP : printerSlotY;

    mesh.position.y = printY + height * (1 - revealProgress);
    mesh.position.z = PRINT_Z;
    mesh.position.x = 0;
    mesh.scale.setScalar(1);
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
      mesh.position.y = printY;
      mesh.rotation.x = THREE.MathUtils.degToRad(-5);
      return;
    }

    fallElapsed.current += delta;
    const rawFallProgress = Math.min(fallElapsed.current / LANDING_DURATION, 1);
    const fallProgress = easeOutCubic(rawFallProgress);
    const lift = Math.sin(rawFallProgress * Math.PI);

    mesh.position.x = THREE.MathUtils.lerp(0, stackTransform.x, fallProgress);
    mesh.position.y = THREE.MathUtils.lerp(printY, stackTransform.y, fallProgress);
    mesh.position.z =
      THREE.MathUtils.lerp(PRINT_Z, getTopStackZ() + dropZOffset, fallProgress) + lift * 0.1;
    mesh.rotation.x = THREE.MathUtils.lerp(
      THREE.MathUtils.degToRad(-7),
      stackTransform.rotationX,
      fallProgress,
    );
    mesh.rotation.z = THREE.MathUtils.lerp(
      THREE.MathUtils.degToRad(-0.8),
      stackTransform.rotationZ,
      fallProgress,
    );
    mesh.scale.setScalar(THREE.MathUtils.lerp(1, stackTransform.scale, fallProgress));

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
      onLanded(receiptState, { x: mesh.position.x, y: mesh.position.y, zOffset: dropZOffset });
    }
  });

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (controller !== "resting" || !meshRef.current) return;
    event.stopPropagation();
    isDragging.current = true;
    activePointerId.current = event.pointerId;
    wasDragged.current = true;
    grabFraction.current = event.uv ? 1 - event.uv.y : 0.5;
    dragPlaneZ.current = meshRef.current.position.z;
    dragOffset.current.copy(meshRef.current.position).sub(event.point);
    lastPointerWorld.current.copy(event.point);
    dragSpeed.current = PICKUP_SAG;
    releaseStartZ.current = null;
    releaseElapsed.current = 0;
    gl.domElement.setPointerCapture(event.pointerId);
  }

  function releasePointer(event: ThreeEvent<PointerEvent>) {
    if (controller !== "resting") return;
    event.stopPropagation();
    if (!isDragging.current && activePointerId.current == null) return;
    if (
      activePointerId.current != null &&
      activePointerId.current !== event.pointerId
    ) {
      return;
    }
    commitDrop();
    clearPointerDrag(gl.domElement, isDragging, activePointerId, event.pointerId);
  }

  // Sync the drop-shadow blob's position, size, and opacity to the paper mesh
  // each frame — height above STACK_Z drives spread and softness.
  useFrame(() => {
    const mesh = meshRef.current;
    const shadow = shadowRef.current;
    const edgeShadow = edgeShadowRef.current;
    if (!mesh) return;
    if (shadow) {
      updateShadowFromPosition(
        shadow,
        mesh.position.x,
        mesh.position.y,
        mesh.position.z,
        mesh.rotation.z,
      );
    }
    if (edgeShadow) {
      updateBottomEdgeShadowFromPosition(
        edgeShadow,
        mesh.position.x,
        mesh.position.y,
        mesh.position.z,
        mesh.rotation.z,
        height,
        mesh.scale.x,
      );
    }
  });

  if (!textureData) return null;

  return (
    <>
      <mesh
        ref={shadowRef}
        // Draw shadow AFTER receipts so it can blend onto bodies behind it.
        // Depth test still keeps it from drawing on top of its own receipt.
        renderOrder={210}
      >
        <planeGeometry args={[RECEIPT_W * SHADOW_PLANE_W_MULT, height * SHADOW_PLANE_H_MULT, 1, 1]} />
        <meshBasicMaterial
          map={SHADOW_BLOB_TEXTURE ?? undefined}
          color="#000000"
          transparent
          depthWrite={false}
          toneMapped={false}
          opacity={SHADOW_BASE_OPACITY}
        />
      </mesh>
      <mesh ref={edgeShadowRef} renderOrder={220}>
        <planeGeometry args={[RECEIPT_W * EDGE_SHADOW_W_MULT, EDGE_SHADOW_H, 1, 1]} />
        <meshBasicMaterial
          map={SHADOW_BLOB_TEXTURE ?? undefined}
          color="#000000"
          transparent
          depthTest
          depthWrite={false}
          toneMapped={false}
          opacity={EDGE_SHADOW_OPACITY}
        />
      </mesh>
      <mesh
        ref={meshRef}
        position={
          controller === "resting"
            ? [
                placement?.x ?? stackTransform.x,
                placement?.y ?? stackTransform.y,
                restingZ,
              ]
            : [0, printY, PRINT_Z]
        }
        onPointerDown={handlePointerDown}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onPointerMissed={() => {
          clearPointerDrag(gl.domElement, isDragging, activePointerId);
        }}
      >
        <planeGeometry args={[RECEIPT_W, height, SEG_X, SEG_Y]} />
        <meshBasicMaterial
          ref={materialRef}
          map={textureData.texture}
          color="#ffffff"
          side={THREE.FrontSide}
          toneMapped={false}
          // Multiplies the texture by per-vertex grayscale set in
          // stepPaperPhysics — bent rows darken symmetrically.
          vertexColors
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
    </>
  );
}

function SavedReceiptMesh({
  receipt,
  stackIndex,
  placement,
  dropZOffset,
  onDropped,
  stageHeightPx,
  stageContentTopPx,
  cameraFov,
}: {
  receipt: AnyReceipt;
  stackIndex: number;
  placement?: VisualPlacement;
  dropZOffset: number;
  onDropped: (placement?: VisualPlacement) => void;
  stageHeightPx: number;
  stageContentTopPx: number;
  cameraFov: number;
}) {
  const textureData = useReceiptTexture(receipt);
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const shadowRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const edgeShadowRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null);
  const isDragging = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const wasDragged = useRef(false);
  const grabFraction = useRef(0.4);
  const dragOffset = useRef(new THREE.Vector3());
  const dragPlaneZ = useRef(STACK_Z);
  const lastPointerWorld = useRef(new THREE.Vector3());
  const dragSpeed = useRef(0);
  const releaseStartZ = useRef<number | null>(null);
  const releaseElapsed = useRef(0);
  const raycaster = useThree((state) => state.raycaster);
  const camera = useThree((state) => state.camera);
  const pointer = useThree((state) => state.pointer);
  const gl = useThree((state) => state.gl);
  const commitDrop = useCallback(() => {
    const group = groupRef.current;
    if (group) {
      releaseStartZ.current = group.position.z;
      releaseElapsed.current = 0;
    }
    onDropped(group ? { x: group.position.x, y: group.position.y } : undefined);
  }, [onDropped]);
  usePointerReleaseGuard(gl.domElement, isDragging, activePointerId, commitDrop);

  const aspect = textureData ? textureData.height / textureData.width : 1.45;
  const height = RECEIPT_W * aspect;
  const stackTransform = useMemo(
    () =>
      getStackTransform(
        height,
        stackIndex,
        receipt.rotation,
        stageHeightPx,
        cameraFov,
        stageContentTopPx,
      ),
    [cameraFov, height, receipt.rotation, stackIndex, stageContentTopPx, stageHeightPx],
  );
  const restingZ = getRestingStackZ(
    stackTransform,
    dropZOffset,
    Boolean(placement),
  );
  // Stable nodes — restY is re-derived in stepPaperPhysics each frame so spring
  // state survives any height/aspect change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodes = useMemo(() => createPaperNodes(height), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;

    if (isDragging.current) {
      releaseStartZ.current = null;
      releaseElapsed.current = 0;
      dragPlane.constant = -dragPlaneZ.current;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.ray.intersectPlane(dragPlane, pointerWorld);

      if (hit) {
        const targetX = THREE.MathUtils.clamp(
          hit.x + dragOffset.current.x,
          -DRAG_X_LIMIT,
          DRAG_X_LIMIT,
        );
        const targetY = THREE.MathUtils.clamp(
          hit.y + dragOffset.current.y,
          DRAG_Y_MIN,
          DRAG_Y_MAX,
        );
        const dx = hit.x - lastPointerWorld.current.x;
        const dy = hit.y - lastPointerWorld.current.y;
        const velocity = Math.sqrt(dx * dx + dy * dy) / Math.max(delta, 0.001);
        dragSpeed.current = THREE.MathUtils.lerp(
          dragSpeed.current,
          Math.max(PICKUP_SAG, clamp01(velocity / 24)),
          0.3,
        );
        lastPointerWorld.current.copy(hit);

        group.position.x = THREE.MathUtils.lerp(group.position.x, targetX, 0.24);
        group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.24);
        group.position.z = THREE.MathUtils.lerp(group.position.z, DRAG_Z, 0.18);
        group.rotation.x = THREE.MathUtils.lerp(
          group.rotation.x,
          THREE.MathUtils.degToRad(-4),
          0.12,
        );
        group.rotation.z = THREE.MathUtils.lerp(
          group.rotation.z,
          stackTransform.rotationZ + (targetX - group.position.x) * 0.04,
          0.12,
        );
      }
    } else {
      dragSpeed.current = THREE.MathUtils.lerp(
        dragSpeed.current,
        0,
        RELEASE_UNBEND_DECAY,
      );
      if (!wasDragged.current) {
        group.position.set(
          placement?.x ?? stackTransform.x,
          placement?.y ?? stackTransform.y,
          restingZ,
        );
        group.rotation.set(stackTransform.rotationX, 0, stackTransform.rotationZ);
        group.scale.setScalar(stackTransform.scale);
      } else {
        const targetZ = getTopStackZ() + dropZOffset;
        if (releaseStartZ.current == null) {
          releaseStartZ.current = group.position.z;
          releaseElapsed.current = 0;
        }
        releaseElapsed.current = Math.min(
          releaseElapsed.current + delta,
          RELEASE_DROP_DURATION,
        );
        group.position.z = THREE.MathUtils.lerp(
          releaseStartZ.current,
          targetZ,
          easeInOutCubic(releaseElapsed.current / RELEASE_DROP_DURATION),
        );
        group.rotation.x = THREE.MathUtils.lerp(
          group.rotation.x,
          stackTransform.rotationX,
          0.08,
        );
        group.rotation.z = THREE.MathUtils.lerp(
          group.rotation.z,
          stackTransform.rotationZ,
          0.08,
        );
        group.scale.setScalar(stackTransform.scale);
      }
    }

    stepPaperPhysics({
      geometry: mesh.geometry,
      nodes,
      height,
      delta,
      grabFraction: grabFraction.current,
      dragSpeed: Math.max(dragSpeed.current, stackIndex === 0 ? 0.035 : 0.015),
      isDragging: isDragging.current,
    });
  });

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (!groupRef.current) return;
    event.stopPropagation();
    isDragging.current = true;
    activePointerId.current = event.pointerId;
    wasDragged.current = true;
    grabFraction.current = event.uv ? 1 - event.uv.y : 0.5;
    dragPlaneZ.current = groupRef.current.position.z;
    dragOffset.current.copy(groupRef.current.position).sub(event.point);
    lastPointerWorld.current.copy(event.point);
    dragSpeed.current = PICKUP_SAG;
    releaseStartZ.current = null;
    releaseElapsed.current = 0;
    gl.domElement.setPointerCapture(event.pointerId);
  }

  function releasePointer(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    if (!isDragging.current && activePointerId.current == null) return;
    if (
      activePointerId.current != null &&
      activePointerId.current !== event.pointerId
    ) {
      return;
    }
    commitDrop();
    clearPointerDrag(gl.domElement, isDragging, activePointerId, event.pointerId);
  }

  // Track the group's world position and feed it to the shadow each frame.
  useFrame(() => {
    const group = groupRef.current;
    const shadow = shadowRef.current;
    const edgeShadow = edgeShadowRef.current;
    if (!group) return;
    if (shadow) {
      updateShadowFromPosition(
        shadow,
        group.position.x,
        group.position.y,
        group.position.z,
        group.rotation.z,
      );
    }
    if (edgeShadow) {
      updateBottomEdgeShadowFromPosition(
        edgeShadow,
        group.position.x,
        group.position.y,
        group.position.z,
        group.rotation.z,
        height,
        group.scale.x,
      );
    }
  });

  if (!textureData) return null;

  return (
    <>
      <mesh
        ref={shadowRef}
        // Draw shadows AFTER all receipts (renderOrder > 80) so they can blend
        // onto the bodies of receipts behind them. Subtract stackIndex so
        // deeper shadows draw first — correct back-to-front transparent order.
        renderOrder={200 - stackIndex}
      >
        <planeGeometry args={[RECEIPT_W * SHADOW_PLANE_W_MULT, height * SHADOW_PLANE_H_MULT, 1, 1]} />
        <meshBasicMaterial
          map={SHADOW_BLOB_TEXTURE ?? undefined}
          color="#000000"
          transparent
          depthWrite={false}
          toneMapped={false}
          opacity={SHADOW_BASE_OPACITY}
        />
      </mesh>
      <mesh ref={edgeShadowRef} renderOrder={210}>
        <planeGeometry args={[RECEIPT_W * EDGE_SHADOW_W_MULT, EDGE_SHADOW_H, 1, 1]} />
        <meshBasicMaterial
          map={SHADOW_BLOB_TEXTURE ?? undefined}
          color="#000000"
          transparent
          depthTest
          depthWrite={false}
          toneMapped={false}
          opacity={EDGE_SHADOW_OPACITY}
        />
      </mesh>
      <group
        ref={groupRef}
        renderOrder={80 - stackIndex}
        position={[
          placement?.x ?? stackTransform.x,
          placement?.y ?? stackTransform.y,
          restingZ,
        ]}
        rotation={[stackTransform.rotationX, 0, stackTransform.rotationZ]}
        scale={stackTransform.scale}
      >
        <mesh
          ref={meshRef}
          onPointerDown={handlePointerDown}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
          onPointerMissed={() => {
            clearPointerDrag(gl.domElement, isDragging, activePointerId);
          }}
        >
          <planeGeometry args={[RECEIPT_W, height, SEG_X, SEG_Y]} />
          <meshBasicMaterial
            map={textureData.texture}
            color="#ffffff"
            side={THREE.FrontSide}
            toneMapped={false}
            vertexColors
          />
        </mesh>
      </group>
    </>
  );
}

function makeVisualId(receiptState: StageReceiptState) {
  return `visual:${receiptState.taskId}:${receiptState.taskStartedAt}:${receiptState.upToTs}`;
}

function cloneReceiptTexture(textureData: ReceiptTexture): ReceiptTexture | null {
  if (typeof document === "undefined") return null;
  const source = textureData.texture.image as CanvasImageSource | undefined;
  if (!source) return null;

  const canvas = document.createElement("canvas");
  canvas.width = textureData.width;
  canvas.height = textureData.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(source, 0, 0, textureData.width, textureData.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = textureData.texture.anisotropy;
  texture.needsUpdate = true;

  return {
    texture,
    key: textureData.key,
    width: textureData.width,
    height: textureData.height,
  };
}

function getPrinterY(
  height: number,
  stageHeightPx: number,
  stageContentTopPx = 0,
) {
  return (
    stageHeightPx / 2 / UNIT_PX -
    stageContentTopPx / UNIT_PX -
    PRINT_TOP_PADDING -
    height / 2
  );
}

function getStackY(
  height: number,
  stackIndex: number,
  stageHeightPx: number,
  stageContentTopPx = 0,
) {
  return (
    (
      stageHeightPx / 2 -
      stageContentTopPx -
      PRINTER_TO_STACK_OFFSET -
      (height * UNIT_PX) / 2
    ) / UNIT_PX -
    stackIndex * STACK_Y_STEP
  );
}

function getStackTransform(
  height: number,
  stackIndex: number,
  rotationSeed = 0,
  stageHeightPx = DEFAULT_STAGE_H_PX,
  cameraFov = getCameraFov(stageHeightPx),
  stageContentTopPx = 0,
): StackTransform {
  const z = getStackZ(stackIndex);
  return {
    x: stackIndex * STACK_X_STEP,
    y: projectPrintPlaneY(
      getStackY(height, stackIndex, stageHeightPx, stageContentTopPx),
      z,
      cameraFov,
    ),
    z,
    rotationX: THREE.MathUtils.degToRad(-1.6 - Math.min(stackIndex, 4) * 0.12),
    rotationZ: THREE.MathUtils.degToRad(rotationSeed + stackIndex * 0.25),
    scale: 1 - stackIndex * STACK_SCALE_STEP,
  };
}

function getStackZ(stackIndex: number) {
  return getTopStackZ() - stackIndex * STACK_Z_STEP;
}

function getTopStackZ() {
  return STACK_Z + STACK_TOP_Z_CLEARANCE;
}

function getRestingStackZ(
  stackTransform: StackTransform,
  dropZOffset: number,
  hasManualPlacement: boolean,
) {
  return hasManualPlacement || dropZOffset > 0
    ? getTopStackZ() + dropZOffset
    : stackTransform.z;
}

function normalizeManualPlacements(
  placements: Record<string, VisualPlacement>,
  recentKeys: string[],
) {
  const normalized: Record<string, VisualPlacement> = {};
  for (const [key, placement] of Object.entries(placements)) {
    const recentIndex = recentKeys.indexOf(key);
    normalized[key] = {
      ...placement,
      zOffset: recentIndex >= 0 ? getDropSlotZOffset(recentIndex) : 0,
    };
  }
  return normalized;
}

function getDropSlotZOffset(slotIndex: number) {
  return Math.max(0, TOP_DROP_Z_OFFSET - slotIndex * TOP_LAYER_Z_STEP);
}

function projectPrintPlaneY(printPlaneY: number, z: number, cameraFov: number) {
  return printPlaneY * (visibleHeightAtZ(z, cameraFov) / visibleHeightAtZ(PRINT_Z, cameraFov));
}

function visibleHeightAtZ(z: number, cameraFov: number) {
  return (
    2 *
    (CAMERA_Z - z) *
    Math.tan(THREE.MathUtils.degToRad(cameraFov) / 2)
  );
}

function getCameraFov(stageHeightPx: number) {
  return THREE.MathUtils.radToDeg(
    2 *
      Math.atan(
        stageHeightPx / UNIT_PX / (2 * (CAMERA_Z - PRINT_Z)),
      ),
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
