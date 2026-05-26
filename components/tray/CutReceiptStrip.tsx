"use client";

import { useMemo, useState } from "react";
import {
  useStore,
  type AnyReceipt,
  type CutReceiptSnapshot,
} from "@/lib/store";
import { ReceiptPrintStrip } from "./ReceiptPrintStrip";
import { PrintedReceipt3D } from "./PrintedReceipt3D";

/**
 * Frozen strip at the printer while completing — grid stays visible through
 * the photo step; tear + cut appear only after the photo is attached.
 * Unmounts instantly when the receipt lands in the stack (no exit anim —
 * ReceiptStack owns the landing motion).
 */
export function CutReceiptStrip() {
  const cutReceipt = useStore((s) => s.cutReceipt);

  if (!cutReceipt) return null;

  return (
    <CutReceiptStripInner
      key={`${cutReceipt.taskId}:${cutReceipt.frozenAt}:${cutReceipt.isCut ? "cut" : "print"}`}
      cut={cutReceipt}
    />
  );
}

function CutReceiptStripInner({ cut }: { cut: CutReceiptSnapshot }) {
  const taskTitle = useStore(
    (s) => s.tasks.find((t) => t.id === cut.taskId)?.title,
  );
  const finalizeComplete = useStore((s) => s.finalizeComplete);
  const clearLandingReceipt = useStore((s) => s.clearLandingReceipt);
  const [cutComplete, setCutComplete] = useState(false);
  const [meshReady, setMeshReady] = useState(false);

  const receipt = useMemo<AnyReceipt>(
    () => ({
      kind: "task",
      id: `cut-${cut.taskId}-${cut.frozenAt}`,
      sourceTaskId: cut.taskId,
      number: 0,
      printedAt: cut.frozenAt,
      rotation: 0,
      taskTitle: taskTitle ?? "Receipt",
      taskStartedAt: cut.taskStartedAt,
      taskCompletedAt: cut.frozenAt,
      dayCounter: 0,
      timeline: cut.timeline,
      squares: cut.squares,
      photoDataUrl: cut.photoDataUrl ?? null,
      totalActiveMs: 0,
      totalBreakMs: 0,
      breakCount: 0,
      motto: "",
    }),
    [cut, taskTitle],
  );

  const show3D = Boolean(cut.isCut) && cutComplete;
  const use3DVisual = show3D && meshReady;

  const finishLanding = () => {
    finalizeComplete(cut.photoDataUrl ?? null);
    window.requestAnimationFrame(clearLandingReceipt);
  };

  return (
    <div className="relative w-[380px]">
      {show3D && (
        <PrintedReceipt3D
          receipt={receipt}
          active={use3DVisual}
          onReady={() => setMeshReady(true)}
          onComplete={finishLanding}
        />
      )}

      <div className={use3DVisual ? "opacity-0" : ""}>
        <ReceiptPrintStrip
          taskStartedAt={cut.taskStartedAt}
          timeline={cut.timeline}
          upToTs={cut.frozenAt}
          squares={cut.squares}
          feedFromPrinter
          showTearTop={cut.isCut}
          showCutLine={cut.isCut}
          photoDataUrl={cut.photoDataUrl}
          printRevealPhoto={cut.isCut}
          taskTitle={taskTitle}
          printedAt={cut.frozenAt}
          onCutComplete={() => setCutComplete(true)}
          className="shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
        />
      </div>
    </div>
  );
}
