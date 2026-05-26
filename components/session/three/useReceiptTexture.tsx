"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import html2canvas from "html2canvas";
import * as THREE from "three";
import {
  SQUARES_PER_ROW,
  efficiency,
  squareRows,
  type SquareState,
} from "@/lib/computeSquares";
import type { AnyReceipt } from "@/lib/store";
import { MOOD_PHOTO_RENDER_H, MOOD_PHOTO_RENDER_W } from "@/lib/halftone";
import { Receipt } from "@/components/tray/Receipt";

export type ReceiptTexture = {
  texture: THREE.CanvasTexture;
  key: string;
  width: number;
  height: number;
};

const CAPTURE_WIDTH = 380;
const HTML_CAPTURE_TIMEOUT_MS = 900;

export function useReceiptTexture(receipt: AnyReceipt): ReceiptTexture | null {
  const element = useMemo(() => <Receipt receipt={receipt} />, [receipt]);
  return useReceiptElementTexture({
    element,
    textureKey: receipt.id,
    fallbackReceipt: receipt,
  });
}

export function useReceiptElementTexture({
  element,
  textureKey,
  fallbackReceipt = null,
  keepPrevious = false,
  preferFallback = false,
  fallbackHeader = true,
}: {
  element: ReactElement;
  textureKey: string;
  fallbackReceipt?: AnyReceipt | null;
  keepPrevious?: boolean;
  preferFallback?: boolean;
  fallbackHeader?: boolean;
}): ReceiptTexture | null {
  const [result, setResult] = useState<ReceiptTexture | null>(null);
  const latestTexture = useRef<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    return () => {
      latestTexture.current?.dispose();
      latestTexture.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let root: Root | null = null;
    let host: HTMLDivElement | null = null;

    function setCanvasTexture(canvas: HTMLCanvasElement) {
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;

      const nextResult = {
        texture,
        key: textureKey,
        width: canvas.width,
        height: canvas.height,
      };

      setResult((previous) => {
        if (previous?.texture && previous.texture !== texture) {
          previous.texture.dispose();
        }
        latestTexture.current = texture;
        return nextResult;
      });
    }

    async function capture() {
      if (!keepPrevious) setResult(null);
      if (preferFallback) {
        setCanvasTexture(
          await drawReceiptFallbackAsync(fallbackReceipt, {
            showHeader: fallbackHeader,
          }),
        );
        return;
      }

      host = document.createElement("div");
      host.style.position = "fixed";
      host.style.left = "-10000px";
      host.style.top = "0";
      host.style.width = `${CAPTURE_WIDTH}px`;
      host.style.pointerEvents = "none";
      host.style.zIndex = "-1";
      document.body.appendChild(host);

      root = createRoot(host);
      root.render(element);

      await waitForPaint();
      await document.fonts?.ready;

      if (disposed) {
        root.unmount();
        host.remove();
        return;
      }

      inlineComputedStyles(host);

      const captureHeight = Math.ceil(host.getBoundingClientRect().height);
      let canvas = await captureWithHtml2Canvas(
        host,
        captureHeight,
        fallbackReceipt,
      );

      if (!canvasHasDarkInk(canvas)) {
        canvas = await drawReceiptFallbackAsync(fallbackReceipt, {
          showHeader: fallbackHeader,
        });
      }

      if (disposed) {
        root.unmount();
        host.remove();
        return;
      }

      setCanvasTexture(canvas);

      root.unmount();
      host.remove();
    }

    capture().catch((error) => {
      console.warn("Failed to generate receipt texture; using canvas fallback", error);
      if (root) root.unmount();
      host?.remove();
      if (!disposed) {
        drawReceiptFallbackAsync(fallbackReceipt, { showHeader: fallbackHeader }).then(
          (canvas) => {
            if (!disposed) setCanvasTexture(canvas);
          },
        );
      }
    });

    return () => {
      disposed = true;
      if (root) root.unmount();
    };
  }, [
    element,
    fallbackHeader,
    fallbackReceipt,
    keepPrevious,
    preferFallback,
    textureKey,
  ]);

  return result;
}

async function captureWithHtml2Canvas(
  host: HTMLElement,
  height: number,
  fallbackReceipt: AnyReceipt | null,
) {
  try {
    const capturePromise = html2canvas(host, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      width: CAPTURE_WIDTH,
      height,
      onclone: (_clonedDocument, clonedElement) => {
        clonedElement.ownerDocument
          .querySelectorAll("style,link[rel='stylesheet']")
          .forEach((node) => node.remove());
      },
    }).catch((error) => {
      console.warn("html2canvas receipt capture failed; using canvas fallback", error);
      return drawReceiptFallback(fallbackReceipt);
    });

    const timeoutPromise = new Promise<HTMLCanvasElement>((resolve) => {
      window.setTimeout(
        () => resolve(drawReceiptFallback(fallbackReceipt)),
        HTML_CAPTURE_TIMEOUT_MS,
      );
    });

    return await Promise.race([capturePromise, timeoutPromise]);
  } catch (error) {
    console.warn("html2canvas receipt capture failed; using canvas fallback", error);
    return drawReceiptFallback(fallbackReceipt);
  }
}

function drawReceiptFallback(
  receipt: AnyReceipt | null,
  options: { photo?: HTMLImageElement; showHeader?: boolean } = {},
) {
  const scale = 2;
  const squares =
    receipt && receipt.kind !== "session" ? (receipt.squares ?? []) : [];
  const rows = Math.max(1, Math.ceil(squares.length / 10));
  const showHeader = options.showHeader ?? true;
  const photoW = CAPTURE_WIDTH - 40;
  const photoH = Math.round(photoW * (MOOD_PHOTO_RENDER_H / MOOD_PHOTO_RENDER_W));
  const hasPhoto =
    showHeader && receipt?.kind !== "session" && Boolean(receipt?.photoDataUrl);
  const gridStartY = hasPhoto ? 132 + photoH : 136;
  const height =
    receipt?.kind === "session"
      ? 260
      : showHeader
        ? Math.max(180 + rows * 18, gridStartY + rows * 18 + 64)
        : 62 + rows * 18;
  const canvas = document.createElement("canvas");
  canvas.width = CAPTURE_WIDTH * scale;
  canvas.height = height * scale;

  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, CAPTURE_WIDTH, height);

  if (!showHeader && receipt && receipt.kind !== "session") {
    drawPrintStripFallback(context, receipt, squares, height);
    drawReceiptBottomRule(context, height);
    return canvas;
  }

  context.fillStyle = "#2a2a2a";
  context.font = "600 13px monospace";
  context.textAlign = "center";
  context.fillText("WORK RECIPE", CAPTURE_WIDTH / 2, 30);

  context.font = "600 11px monospace";
  context.fillText(
    receipt?.kind === "session" ? "SESSION SUMMARY" : (receipt?.taskTitle ?? "RECEIPT"),
    CAPTURE_WIDTH / 2,
    55,
  );

  context.font = "9px monospace";
  context.fillStyle = "rgba(42,42,42,0.75)";
  const printedAt = receipt?.printedAt ? new Date(receipt.printedAt) : new Date();
  context.fillText(printedAt.toLocaleString(), CAPTURE_WIDTH / 2, 74);

  context.strokeStyle = "rgba(42,42,42,0.28)";
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(20, 92);
  context.lineTo(CAPTURE_WIDTH - 20, 92);
  context.stroke();
  context.setLineDash([]);

  if (receipt && receipt.kind !== "session") {
    drawTaskFallback(context, receipt, squares, height, {
      photo: options.photo,
      photoH,
      photoW,
      showPhoto: hasPhoto,
      gridStartY,
    });
    drawTaskFooter(context, receipt, height);
  } else if (receipt?.kind === "session") {
    drawSessionFallback(context, receipt);
    context.font = "9px monospace";
    context.fillStyle = "rgba(42,42,42,0.55)";
    context.textAlign = "center";
    context.fillText("THANK YOU FOR FOCUSING", CAPTURE_WIDTH / 2, height - 20);
  }
  drawReceiptBottomRule(context, height);

  return canvas;
}

async function drawReceiptFallbackAsync(
  receipt: AnyReceipt | null,
  options: { showHeader?: boolean } = {},
) {
  if (
    !receipt ||
    receipt.kind === "session" ||
    !options.showHeader ||
    !receipt.photoDataUrl
  ) {
    return drawReceiptFallback(receipt, options);
  }

  const photo = await loadImage(receipt.photoDataUrl).catch(() => null);
  return drawReceiptFallback(receipt, { ...options, photo: photo ?? undefined });
}

function drawTaskFallback(
  context: CanvasRenderingContext2D,
  receipt: Exclude<AnyReceipt, { kind: "session" }>,
  squares: SquareState[],
  height: number,
  options: {
    gridStartY: number;
    photo?: HTMLImageElement;
    photoH: number;
    photoW: number;
    showPhoto: boolean;
  },
) {
  context.textAlign = "left";
  context.font = "10px monospace";
  context.fillStyle = "#2a2a2a";

  if (options.showPhoto) {
    const photoX = (CAPTURE_WIDTH - options.photoW) / 2;
    const photoY = 106;

    if (options.photo) {
      context.drawImage(
        options.photo,
        photoX,
        photoY,
        options.photoW,
        options.photoH,
      );
    }

    context.strokeStyle = "rgba(42,42,42,0.3)";
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(20, photoY + options.photoH + 18);
    context.lineTo(CAPTURE_WIDTH - 20, photoY + options.photoH + 18);
    context.stroke();
    context.setLineDash([]);
  } else {
    context.fillText(`ACTIVE ${formatFallbackDuration(receipt.totalActiveMs)}`, 24, 116);
    context.fillText(`BREAKS ${receipt.breakCount}`, 210, 116);
  }

  const startX = 24;
  const startY = options.gridStartY;
  const size = 10;
  const gap = 4;
  const rowGap = 18;
  const rows = squareRows(squares);

  rows.forEach((row, rowIndex) => {
    const y = startY + rowIndex * rowGap;
    drawFallbackRow(context, receipt, row, rowIndex, startX, y, size, gap);
  });

  context.fillStyle = "rgba(42,42,42,0.75)";
  context.textAlign = "center";
  context.font = "italic 10px monospace";
  if (receipt.motto) {
    context.fillText(`"${receipt.motto}"`, CAPTURE_WIDTH / 2, height - 42);
  }
}

function drawPrintStripFallback(
  context: CanvasRenderingContext2D,
  receipt: Exclude<AnyReceipt, { kind: "session" }>,
  squares: SquareState[],
  height: number,
) {
  context.textAlign = "left";
  const startX = 24;
  const footerY = height - 20;
  const rowBottomY = footerY - 22;
  const size = 10;
  const gap = 4;
  const rowGap = 18;
  const rows = squareRows(squares);

  rows.forEach((row, rowIndex) => {
    const y = rowBottomY - rowIndex * rowGap;
    drawFallbackRow(context, receipt, row, rowIndex, startX, y, size, gap);
  });

  context.fillStyle = "#2a2a2a";
  context.font = "9px monospace";
  context.textAlign = "left";
  context.fillText(`${formatFallbackTime(receipt.taskStartedAt)} Start --->`, 24, footerY);
  context.textAlign = "right";
  context.fillText("1 square = 1 mins", CAPTURE_WIDTH - 24, footerY);
}

function drawFallbackRow(
  context: CanvasRenderingContext2D,
  receipt: Exclude<AnyReceipt, { kind: "session" }>,
  row: SquareState[],
  rowIndex: number,
  startX: number,
  y: number,
  size: number,
  gap: number,
) {
  row.forEach((square, squareIndex) => {
    const x = startX + squareIndex * (size + gap);
    context.fillStyle = square === "work" ? "#2a2a2a" : "#ffffff";
    context.fillRect(x, y, size, size);
    context.strokeStyle = "#2a2a2a";
    context.strokeRect(x, y, size, size);
  });

  for (let squareIndex = row.length; squareIndex < SQUARES_PER_ROW; squareIndex += 1) {
    const x = startX + squareIndex * (size + gap);
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, size, size);
  }

  if (row.length === 0) return;

  const rowEndMin = rowIndex * SQUARES_PER_ROW + row.length;
  const rowEndTs = receipt.taskStartedAt + rowEndMin * 60_000;
  context.fillStyle = "#2a2a2a";
  context.font = "9px monospace";
  context.textAlign = "left";
  context.fillText(formatFallbackTime(rowEndTs), startX + 166, y + 10);
  context.textAlign = "right";
  context.fillText(`${efficiency(row)}% on task`, CAPTURE_WIDTH - 24, y + 10);
}

function drawTaskFooter(
  context: CanvasRenderingContext2D,
  receipt: Exclude<AnyReceipt, { kind: "session" }>,
  height: number,
) {
  const footerY = height - 20;
  context.fillStyle = "#2a2a2a";
  context.font = "9px monospace";
  context.textAlign = "left";
  context.fillText(`${formatFallbackTime(receipt.taskStartedAt)} Start --->`, 24, footerY);
  context.textAlign = "right";
  context.fillText("1 square = 1 mins", CAPTURE_WIDTH - 24, footerY);
}

function drawReceiptBottomRule(context: CanvasRenderingContext2D, height: number) {
  context.save();
  context.strokeStyle = "#d8d8d8";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, height - 0.5);
  context.lineTo(CAPTURE_WIDTH, height - 0.5);
  context.stroke();
  context.restore();
}

function drawSessionFallback(
  context: CanvasRenderingContext2D,
  receipt: Extract<AnyReceipt, { kind: "session" }>,
) {
  context.textAlign = "left";
  context.font = "10px monospace";
  context.fillStyle = "#2a2a2a";
  context.fillText(`TASKS ${receipt.tasksCompleted.length}`, 24, 116);
  context.fillText(`ACTIVE ${formatFallbackDuration(receipt.sessionActiveMs)}`, 24, 136);
  context.fillText(`BREAK ${formatFallbackDuration(receipt.sessionBreakMs)}`, 24, 156);
}

function formatFallbackDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function formatFallbackTime(ts: number) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasHasDarkInk(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return true;

  const { width, height } = canvas;
  const step = 8;
  let darkPixels = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
      if (a > 20 && r + g + b < 400) darkPixels += 1;
      if (darkPixels > 8) return true;
    }
  }

  return false;
}

async function waitForPaint() {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function inlineComputedStyles(root: HTMLElement) {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const node of nodes) {
    const computed = window.getComputedStyle(node);
    for (const property of computed) {
      const value = computed.getPropertyValue(property);
      if (value.includes("oklab(")) continue;
      node.style.setProperty(
        property,
        value,
        computed.getPropertyPriority(property),
      );
    }
  }
}
