const TONES = {
  neutral: "border-ink-600 text-chalk-200",
  brass: "border-brass-500/60 text-brass-300",
  ok: "border-ok-500/50 text-ok-300",
  danger: "border-danger-500/50 text-danger-300",
};

export default function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${TONES[tone]}`}>
      {children}
    </span>
  );
}
