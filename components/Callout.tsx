const STYLES = {
  error: "bg-red-500/15 border-red-500 text-red-200",
  info: "bg-blue-500/10 border-blue-500 text-blue-100",
  warn: "bg-yellow-500/15 border-yellow-500 text-yellow-100",
  success: "bg-green-500/10 border-green-500 text-green-200",
} as const;

export default function Callout({
  kind,
  children,
}: {
  kind: keyof typeof STYLES;
  children: React.ReactNode;
}) {
  return <div className={`border p-4 rounded-xl text-sm ${STYLES[kind]}`}>{children}</div>;
}
