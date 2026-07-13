export default function ProgressBar({
  value,
  barClassName = "bg-indigo-500",
}: {
  /** 0~100 */
  value: number;
  barClassName?: string;
}) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${barClassName}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
