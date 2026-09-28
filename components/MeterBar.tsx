export default function MeterBar({ value, tone = "brass" }: { value: number; tone?: "brass" | "ok" | "danger" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const color = tone === "ok" ? "bg-ok-500" : tone === "danger" ? "bg-danger-500" : "bg-brass-400";

  return (
    <div className="h-1.5 w-full rounded-full bg-ink-700 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
