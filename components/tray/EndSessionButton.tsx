"use client";

import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export function EndSessionButton() {
  const router = useRouter();
  const endSession = useStore((s) => s.endSession);
  const sessionStartedAt = useStore((s) => s.sessionStartedAt);

  const idle = sessionStartedAt === null;

  return (
    <button
      onClick={() => {
        endSession();
        router.push("/session/summary");
      }}
      disabled={idle}
      className="btn-end-session h-[68px] w-[360px] rounded-full text-[18px] tracking-[0.06em] text-[color:var(--color-ink)] disabled:opacity-60 disabled:cursor-not-allowed"
      title={idle ? "Start the timer to begin a session" : "Open session summary"}
    >
      Session summary
    </button>
  );
}
