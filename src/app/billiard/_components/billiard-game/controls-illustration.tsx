const KEYS = [
  { label: "Shift", x: 24, y: 72, width: 60 },
  { label: "A", x: 88, y: 52, width: 42 },
  { label: "W", x: 134, y: 24, width: 42 },
  { label: "D", x: 180, y: 52, width: 42 },
  { label: "Space", x: 226, y: 96, width: 96 },
];

export const ControlsIllustration = () => (
  <figure className="billiard-help-illustration hidden rounded-lg border border-border bg-muted/35 p-3 2xl:block">
    <svg viewBox="0 0 544 205" className="mx-auto w-full max-w-lg" aria-hidden="true">
      <rect x="10" y="12" width="330" height="128" rx="15" className="fill-background stroke-border" />
      <g className="fill-primary/10 stroke-primary/45">
        {KEYS.map(({ label, x, y, width }) => (
          <rect key={label} x={x} y={y} width={width} height="38" rx="6" />
        ))}
      </g>
      <path
        d="M124 201l-5-22c-4-15-12-26-23-37l-29-30c-9-10 4-22 13-13l31 26-9-40c-3-13 14-17 18-4l16 40 10-64c2-13 20-12 19 1l-3 62 29-39c7-10 21-2 15 9l-24 47 44-18c13-5 19 11 8 17l-38 22c-11 7-16 19-17 43z"
        className="fill-primary/20 stroke-primary" strokeWidth="2" strokeLinejoin="round"
      />
      <g className="fill-foreground font-mono text-[14px] font-semibold" textAnchor="middle">
        {KEYS.map(({ label, x, y, width }) => (
          <text key={label} x={x + width / 2} y={y + 23}>{label}</text>
        ))}
      </g>
      <rect x="390" y="12" width="104" height="152" rx="50" className="fill-background stroke-border" strokeWidth="2" />
      <path d="M442 13v53m-45 0h90" className="stroke-border" strokeWidth="2" />
      <rect x="437" y="28" width="10" height="22" rx="5" className="fill-primary/50" />
      <path
        d="M426 201l-6-21c-13-13-24-26-28-41l-9-30c-4-12 12-17 17-5l10 23-3-70c-1-13 16-15 18-2l8 49 14-58c3-13 20-10 18 4l-6 59 13-43c4-12 19-8 17 4l-6 57 10-23c5-11 19-6 16 6l-12 47c-4 16-14 25-16 44z"
        className="fill-primary/20 stroke-primary" strokeWidth="2" strokeLinejoin="round"
      />
    </svg>
    <figcaption className="mt-2 text-center text-xs">
      Tay trái từ ngón út đến ngón cái đặt trên Shift, A, W, D, Space. Tay phải cầm chuột.
    </figcaption>
  </figure>
);
