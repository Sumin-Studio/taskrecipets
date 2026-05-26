"use client";

import { useEffect, useRef, useState } from "react";
import { EndSessionButton } from "./EndSessionButton";
import {
  ReceiptStage3D,
  type ReceiptStageDemoAdapter,
} from "./ReceiptStage3D";

const TRAY_BASE_WIDTH = 720;
const TRAY_SURFACE_TOP_PX = 82;
const RECEIPT_STAGE_BLEED_PX = 120;
/** Screen-space width of the left/right tray edge fade (constant regardless of scale). */
const TRAY_EDGE_FADE_SCREEN_PX = 4;
/** Screen-space nudge so the scaled scene lines up with the timer widget top. */
const TRAY_ALIGN_OFFSET_PX = 56;

type TrayProps = {
  demo?: ReceiptStageDemoAdapter;
  footer?: React.ReactNode;
  /** Workspace anchors right under the timer; centered fills the demo page tray area. */
  variant?: "workspace" | "centered";
};

export function Tray({ demo, footer, variant = "workspace" }: TrayProps = {}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState({ scale: 1, height: 0, containerHeight: 0 });
  const anchorRight = variant === "workspace";
  const alignOffsetPx = anchorRight ? TRAY_ALIGN_OFFSET_PX : 0;

  useEffect(() => {
    const el = wrapperRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    let frame = 0;
    const measure = () => {
      const parentRect = parent.getBoundingClientRect();
      const width = el.getBoundingClientRect().width;
      const scale = Math.min(1, width / TRAY_BASE_WIDTH);

      // Span from the nudged top (timer baseline) down to the viewport bottom —
      // the grid row alone is ~brand+gap shorter than the viewport and was
      // clipping the tray image.
      const viewportBottom =
        window.visualViewport != null
          ? window.visualViewport.offsetTop + window.visualViewport.height
          : window.innerHeight;
      const topY = parentRect.top - alignOffsetPx;
      const availableHeight = Math.max(parentRect.height, viewportBottom - topY, 0);

      setScene({
        scale,
        containerHeight: availableHeight,
        height: scale > 0 ? availableHeight / scale : availableHeight,
      });
    };

    frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(parent);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [alignOffsetPx]);

  const edgeFadeX =
    scene.scale > 0 ? TRAY_EDGE_FADE_SCREEN_PX / scene.scale : TRAY_EDGE_FADE_SCREEN_PX;
  const traySurfaceHeight = Math.max(0, scene.height - TRAY_SURFACE_TOP_PX);
  const receiptStageHeight =
    traySurfaceHeight > 0 ? traySurfaceHeight + RECEIPT_STAGE_BLEED_PX * 2 : undefined;

  const scaledScene = (
    <div
      className="absolute top-0 left-1/2 w-[720px] pointer-events-auto"
      style={{
        height: scene.height || "100%",
        transform: `translateX(-50%) scale(${scene.scale})`,
        transformOrigin: "top center",
      }}
    >
      <div className="tray-surface absolute inset-x-0 top-[82px] bottom-0 pointer-events-none">
        <div
          className="tray-surface__image absolute inset-0"
          style={{ "--tray-edge-fade-x": `${edgeFadeX}px` } as React.CSSProperties}
          aria-hidden
        />
      </div>

      <div className="absolute top-[72px] left-1/2 -translate-x-1/2 w-[420px] z-30">
        <div className="printer-slot h-[10px] rounded-b-[4px]" />
      </div>

      <div
        className="absolute z-25 overflow-visible"
        style={{
          left: -RECEIPT_STAGE_BLEED_PX,
          right: -RECEIPT_STAGE_BLEED_PX,
          top: TRAY_SURFACE_TOP_PX - RECEIPT_STAGE_BLEED_PX,
          bottom: -RECEIPT_STAGE_BLEED_PX,
        }}
      >
        <ReceiptStage3D
          stageWidthPx={TRAY_BASE_WIDTH + RECEIPT_STAGE_BLEED_PX * 2}
          stageHeightPx={receiptStageHeight}
          stageContentTopPx={RECEIPT_STAGE_BLEED_PX}
          demo={demo}
        />
      </div>

      {footer ?? (
        !demo ? (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
            <EndSessionButton />
          </div>
        ) : null
      )}
    </div>
  );

  if (anchorRight) {
    return (
      <div className="relative w-full h-full overflow-visible pointer-events-none">
        <div
          ref={wrapperRef}
          className="absolute right-0 w-[720px] overflow-visible pointer-events-none"
          style={{
            top: -TRAY_ALIGN_OFFSET_PX,
            height: scene.containerHeight || "100%",
          }}
        >
          {scaledScene}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full overflow-visible pointer-events-none"
    >
      <div className="absolute inset-0 overflow-visible pointer-events-none">
        {scaledScene}
      </div>
    </div>
  );
}
