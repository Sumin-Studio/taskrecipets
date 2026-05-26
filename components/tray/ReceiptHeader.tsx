import Image from "next/image";

/** e.g. "MARCH 17, 12:00PM" */
export function formatReceiptHeaderDate(ts: number): string {
  const d = new Date(ts);
  const month = d.toLocaleString("en-US", { month: "long" }).toUpperCase();
  const day = d.getDate();
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${month} ${day}, ${h}:${m}${ampm}`;
}

export function ReceiptLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.svg"
      alt=""
      width={2080}
      height={3294}
      unoptimized
      aria-hidden
      draggable={false}
      className={`h-[18px] w-auto shrink-0 select-none ${className ?? ""}`}
    />
  );
}

export function ReceiptHeader({
  taskTitle,
  printedAt,
}: {
  taskTitle: string;
  printedAt: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 text-[10px] tracking-wider">
      <div className="flex items-center gap-2 min-w-0">
        <ReceiptLogo />
        <span className="truncate">{taskTitle}</span>
      </div>
      <time
        dateTime={new Date(printedAt).toISOString()}
        className="shrink-0 uppercase tabular-nums"
      >
        {formatReceiptHeaderDate(printedAt)}
      </time>
    </div>
  );
}
