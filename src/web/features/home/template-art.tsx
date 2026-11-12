import type { ReactNode } from "react";

// Each card shows a small picture of what its template makes. Colors stay the same in both themes, like a logo.
function Sheet({
  x,
  y,
  w,
  h,
  tilt,
  fill = "#fff",
  r = 3,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tilt: number;
  fill?: string;
  r?: number;
  children?: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt} ${w / 2} ${h / 2})`}>
      <rect y={1.5} width={w} height={h} rx={r} fill="#000" opacity={0.14} />
      <rect width={w} height={h} rx={r} fill={fill} />
      {children}
    </g>
  );
}

function Bar({ x, y, w, h = 2.5, fill = "#d4d4d8" }: { x: number; y: number; w: number; h?: number; fill?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
}

const INK = "#18181b";

const ART: Record<string, ReactNode> = {
  store: (
    <>
      <Sheet x={22} y={14} w={60} h={62} tilt={-7} fill="#fda4af" />
      <Sheet x={34} y={12} w={72} h={68} tilt={4}>
        <path d="M0 3a3 3 0 0 1 3-3h66a3 3 0 0 1 3 3v5H0z" fill="#ececf1" />
        <Bar x={5} y={12} w={22} h={3.5} fill={INK} />
        <rect x={5} y={20} width={19} height={19} rx={2} fill="#fed7aa" />
        <rect x={27} y={20} width={19} height={19} rx={2} fill="#bbf7d0" />
        <rect x={49} y={20} width={18} height={19} rx={2} fill="#bfdbfe" />
        <Bar x={5} y={42} w={14} />
        <Bar x={27} y={42} w={14} />
        <Bar x={49} y={42} w={13} />
        <Bar x={5} y={47} w={9} fill={INK} />
        <Bar x={27} y={47} w={9} fill={INK} />
        <Bar x={49} y={47} w={9} fill={INK} />
        <rect x={5} y={56} width={62} height={7} rx={3.5} fill={INK} />
      </Sheet>
    </>
  ),
  booking: (
    <>
      <Sheet x={22} y={14} w={60} h={62} tilt={-6} fill="#fcd34d" />
      <Sheet x={34} y={12} w={72} h={68} tilt={4} fill="#18181b">
        <Bar x={6} y={7} w={26} h={3.5} fill="#fafafa" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={`d${i}`} x={6 + i * 9} y={16} width={7} height={7} rx={1.5} fill={i === 3 ? "#f59e0b" : "#3f3f46"} />
        ))}
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <rect
              key={`t${r}${c}`}
              x={6 + c * 21}
              y={30 + r * 10}
              width={18}
              height={7}
              rx={2}
              fill={r === 1 && c === 1 ? "#f59e0b" : r === 0 && c === 2 ? "#27272a" : "#3f3f46"}
            />
          )),
        )}
        <rect x={6} y={60} width={60} height={6} rx={3} fill="#fafafa" />
      </Sheet>
    </>
  ),
  saas: (
    <>
      <Sheet x={20} y={16} w={62} h={58} tilt={-7} fill="#93c5fd" />
      <Sheet x={30} y={12} w={78} h={66} tilt={3}>
        <path d="M0 3a3 3 0 0 1 3-3h20v66H3a3 3 0 0 1-3-3z" fill="#f4f4f5" />
        <rect x={4} y={5} width={8} height={8} rx={2} fill={INK} />
        <Bar x={4} y={18} w={15} />
        <Bar x={4} y={24} w={12} fill={INK} />
        <Bar x={4} y={30} w={14} />
        <Bar x={4} y={36} w={11} />
        <Bar x={28} y={7} w={26} h={3.5} fill={INK} />
        <rect x={28} y={16} width={44} height={22} rx={2} fill="#eff6ff" />
        <path d="M30 34l8-6 7 3 8-8 8 4 9-7" stroke="#2563eb" strokeWidth={1.4} fill="none" />
        <rect x={28} y={42} width={44} height={5} rx={1} fill="#f4f4f5" />
        <rect x={28} y={50} width={44} height={5} rx={1} fill="#f4f4f5" />
        <rect x={28} y={58} width={44} height={5} rx={1} fill="#f4f4f5" />
      </Sheet>
    </>
  ),
  portfolio: (
    <>
      <Sheet x={22} y={14} w={60} h={62} tilt={-7} fill="#86efac" />
      <Sheet x={34} y={12} w={72} h={68} tilt={4} fill="#fafaf9">
        <Bar x={5} y={7} w={30} h={4} fill={INK} />
        <Bar x={5} y={14} w={44} />
        <rect x={5} y={22} width={38} height={26} rx={2} fill="url(#art-dusk)" />
        <rect x={46} y={22} width={21} height={12} rx={2} fill="#d6d3d1" />
        <rect x={46} y={36} width={21} height={12} rx={2} fill="#a8a29e" />
        <rect x={5} y={51} width={21} height={13} rx={2} fill="#78716c" />
        <rect x={29} y={51} width={38} height={13} rx={2} fill="#e7e5e4" />
      </Sheet>
    </>
  ),
  mobile: (
    <>
      <Sheet x={30} y={12} w={36} h={66} tilt={-9} fill="#c4b5fd" r={7} />
      <Sheet x={50} y={8} w={38} h={70} tilt={5} fill="#18181b" r={7}>
        <rect x={3} y={3} width={32} height={64} rx={5} fill="#fafafa" />
        <rect x={14} y={5} width={10} height={2.5} rx={1.25} fill="#18181b" />
        <Bar x={7} y={12} w={16} h={3.5} fill={INK} />
        <circle cx={19} cy={30} r={10} fill="none" stroke="#e4e4e7" strokeWidth={3} />
        <path d="M19 20a10 10 0 0 1 9.5 13" fill="none" stroke="#8b5cf6" strokeWidth={3} strokeLinecap="round" />
        <rect x={7} y={45} width={24} height={5} rx={2} fill="#f4f4f5" />
        <rect x={7} y={52} width={24} height={5} rx={2} fill="#f4f4f5" />
        <rect x={7} y={59} width={24} height={5} rx={2.5} fill="#8b5cf6" />
      </Sheet>
    </>
  ),
  website: (
    <>
      <Sheet x={22} y={12} w={60} h={66} tilt={-7} fill="#a78bfa" />
      <Sheet x={34} y={14} w={72} h={70} tilt={4}>
        <path d="M0 3a3 3 0 0 1 3-3h66a3 3 0 0 1 3 3v5H0z" fill="#ececf1" />
        <circle cx={5} cy={4} r={1.2} fill="#f87171" />
        <circle cx={9} cy={4} r={1.2} fill="#fbbf24" />
        <circle cx={13} cy={4} r={1.2} fill="#34d399" />
        <rect x={5} y={12} width={62} height={26} rx={2} fill="url(#art-dusk)" />
        <circle cx={52} cy={24} r={6} fill="#fef3c7" />
        <path d="M5 38l15-11 11 7 9-5 27 9z" fill="#7c2d12" opacity={0.55} />
        <Bar x={5} y={43} w={38} h={4} fill={INK} />
        <Bar x={5} y={50} w={52} />
        <rect x={5} y={57} width={20} height={7} rx={3.5} fill="#ea580c" />
      </Sheet>
    </>
  ),
  dashboard: (
    <>
      <Sheet x={24} y={14} w={60} h={62} tilt={-6} fill="#67e8f9" />
      <Sheet x={32} y={16} w={76} h={62} tilt={3} fill="#111827">
        <rect x={5} y={5} width={20} height={13} rx={2} fill="#1f2937" />
        <rect x={28} y={5} width={20} height={13} rx={2} fill="#1f2937" />
        <rect x={51} y={5} width={20} height={13} rx={2} fill="#1f2937" />
        <Bar x={8} y={8} w={10} h={2} fill="#6b7280" />
        <Bar x={8} y={12} w={13} h={3} fill="#f9fafb" />
        <Bar x={31} y={8} w={10} h={2} fill="#6b7280" />
        <Bar x={31} y={12} w={9} h={3} fill="#f9fafb" />
        <Bar x={54} y={8} w={10} h={2} fill="#6b7280" />
        <Bar x={54} y={12} w={14} h={3} fill="#34d399" />
        <path d="M5 52l12-8 11 4 12-13 12 6 19-15v26z" fill="#34d399" opacity={0.2} />
        <path d="M5 52l12-8 11 4 12-13 12 6 19-15" fill="none" stroke="#34d399" strokeWidth={1.8} strokeLinejoin="round" />
      </Sheet>
    </>
  ),
  game: (
    <>
      <Sheet x={20} y={16} w={62} h={58} tilt={-8} fill="#f0abfc" />
      <Sheet x={34} y={12} w={72} h={68} tilt={4} fill="#1e1b4b" r={4}>
        <rect x={4} y={4} width={64} height={60} rx={2} fill="url(#art-night)" />
        <circle cx={51} cy={18} r={7} fill="#fde68a" />
        <path d="M4 36l18-9 13 6 13-8 20 11z" fill="#312e81" />
        <path d="M4 64l28-28h8l28 28z" fill="#3f3f46" />
        <path d="M36 38v5m0 4v6m0 4v7" stroke="#fafafa" strokeWidth={1.4} />
        <rect x={40} y={50} width={11} height={7} rx={2} fill="#ef4444" />
        <rect x={42} y={47} width={7} height={4} rx={1.5} fill="#fecaca" />
        <Bar x={8} y={8} w={15} h={3} fill="#fafafa" />
      </Sheet>
    </>
  ),
};

export function TemplateArt({ kind, className }: { kind: string; className?: string }) {
  return (
    <svg viewBox="0 0 112 80" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="art-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#f97316" />
          <stop offset="1" stopColor="#fda4af" />
        </linearGradient>
        <linearGradient id="art-night" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#4338ca" />
          <stop offset="0.7" stopColor="#db2777" />
        </linearGradient>
        <linearGradient id="art-rose" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ec4899" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
      </defs>
      {ART[kind]}
    </svg>
  );
}
