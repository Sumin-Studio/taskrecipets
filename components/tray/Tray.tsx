"use client";

import { ReceiptStack } from "./ReceiptStack";
import { EndSessionButton } from "./EndSessionButton";

export function Tray() {
  return (
    <div className="relative w-full h-full min-h-[920px] flex flex-col items-center">
      {/* printer slot — dark bar above the tray */}
      <div className="relative w-[520px] z-30">
        <div className="printer-slot h-[10px] rounded-b-[4px] shadow-[0_4px_10px_rgba(0,0,0,0.18)]" />
      </div>

      {/* tray container */}
      <div className="relative mt-[-1px] w-full flex-1">
        {/* the tray image — mix-blend-multiply dissolves the white jpg background into the ground */}
        <div
          className="absolute -inset-x-[6%] -inset-y-[4%] -rotate-[1.25deg] origin-center pointer-events-none"
          style={{
            backgroundImage: "url(/tray.jpg)",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            mixBlendMode: "multiply",
            filter: "drop-shadow(-8px 5px 40px rgba(0,0,0,0.28))",
          }}
        />

        {/* receipts land slightly off-center to follow the tray's tilt */}
        <div className="absolute inset-0 flex items-start justify-center pt-[20px] -rotate-[1.25deg] origin-top">
          <ReceiptStack />
        </div>

        <div className="absolute bottom-[70px] left-1/2 -translate-x-1/2 z-30 -rotate-[1.25deg]">
          <EndSessionButton />
        </div>
      </div>
    </div>
  );
}
