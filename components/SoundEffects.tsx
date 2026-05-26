"use client";

import { useEffect } from "react";
import { playButtonClick } from "@/lib/soundEffects";
import { useStore } from "@/lib/store";

export function SoundEffects() {
  const soundOn = useStore((s) => s.settings.soundOn);

  useEffect(() => {
    if (!soundOn) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest('button[data-sound-effect="timer-main"]');
      if (!button) return;
      if (button.hasAttribute("disabled")) return;
      if (button.getAttribute("aria-disabled") === "true") return;

      playButtonClick();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [soundOn]);

  return null;
}
