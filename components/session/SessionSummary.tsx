"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, type Receipt as ReceiptData } from "@/lib/store";
import { SessionSummaryView } from "./SessionSummaryView";
import { WipeConfirmModal } from "./WipeConfirmModal";

export function SessionSummary() {
  const router = useRouter();
  const endedSession = useStore((s) => s.endedSession);
  const receipts = useStore((s) => s.receipts);
  const hasHydrated = useStore((s) => s.hasHydrated);
  const wipeForFreshStart = useStore((s) => s.wipeForFreshStart);

  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

  useEffect(() => {
    if (hasHydrated && !endedSession) router.replace("/");
  }, [hasHydrated, endedSession, router]);

  const taskReceipts = useMemo(
    () => receipts.filter((r): r is ReceiptData => r.kind !== "session"),
    [receipts],
  );

  if (!endedSession) {
    return <div className="h-screen w-screen bg-[color:var(--color-ground)]" />;
  }

  return (
    <>
      <SessionSummaryView
        endedSession={endedSession}
        receipts={taskReceipts}
        onBack={() => router.push("/")}
        onEndSession={() => setShowWipeConfirm(true)}
      />

      {showWipeConfirm && (
        <WipeConfirmModal
          onCancel={() => setShowWipeConfirm(false)}
          onConfirm={() => {
            wipeForFreshStart();
            router.push("/");
          }}
        />
      )}
    </>
  );
}
