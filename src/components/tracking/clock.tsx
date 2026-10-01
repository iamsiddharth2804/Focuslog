/** Renders "24:57" with tightened colons — tabular figures otherwise space them out. */
export function Clock({ value }: { value: string }) {
  const parts = value.split(":");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="relative -top-[0.06em] mx-[-0.07em] inline-block">:</span>}
          {p}
        </span>
      ))}
    </>
  );
}
