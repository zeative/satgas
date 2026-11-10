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
  poster: (
    <>
      <Sheet x={30} y={10} w={50} h={72} tilt={-8} fill="#a78bfa" />
      <Sheet x={46} y={8} w={54} h={76} tilt={5} fill="#fef3c7" r={2}>
        <circle cx={27} cy={25} r={17} fill="#ef4444" />
        <circle cx={35} cy={18} r={8} fill="#fbbf24" />
        <rect y={44} width={54} height={8} fill={INK} />
        <Bar x={5} y={56} w={38} h={5} fill={INK} />
        <Bar x={5} y={64} w={26} h={3} fill="#a16207" />
      </Sheet>
    </>
  ),
  deck: (
    <>
      <Sheet x={30} y={10} w={72} h={46} tilt={-7} fill="#c4b5fd" />
      <Sheet x={28} y={20} w={78} h={50} tilt={-1} fill="#4f46e5">
        <Bar x={7} y={9} w={32} h={5} fill="#fff" />
        <Bar x={7} y={19} w={26} fill="#c7d2fe" />
        <Bar x={7} y={25} w={30} fill="#c7d2fe" />
        <Bar x={7} y={31} w={20} fill="#c7d2fe" />
        <circle cx={58} cy={25} r={11} fill="none" stroke="#818cf8" strokeWidth={6} />
        <circle cx={58} cy={25} r={11} fill="none" stroke="#fbbf24" strokeWidth={6} strokeDasharray="42 70" transform="rotate(-90 58 25)" />
      </Sheet>
    </>
  ),
  research: (
    <>
      <Sheet x={26} y={14} w={60} h={64} tilt={-7} fill="#a3e635" />
      <Sheet x={36} y={12} w={72} h={72} tilt={3}>
        <path d="M0 3a3 3 0 0 1 3-3h66a3 3 0 0 1 3 3v9H0z" fill={INK} />
        <Bar x={25} y={5} w={12} fill="#fff" />
        <Bar x={43} y={5} w={12} fill="#fff" />
        <Bar x={58} y={5} w={10} fill="#fff" />
        {[17, 30, 43, 56].map((y, i) => (
          <g key={y}>
            <Bar x={5} y={y} w={14} fill="#71717a" />
            <circle cx={31} cy={y + 1} r={3.5} fill={i % 3 === 2 ? "#fecaca" : "#bbf7d0"} />
            <circle cx={49} cy={y + 1} r={3.5} fill={i % 2 ? "#bbf7d0" : "#fecaca"} />
            <circle cx={63} cy={y + 1} r={3.5} fill={i === 0 ? "#fecaca" : "#bbf7d0"} />
            <path d={`M0 ${y + 9}h72`} stroke="#f4f4f5" />
          </g>
        ))}
      </Sheet>
    </>
  ),
  invitation: (
    <>
      <Sheet x={46} y={6} w={46} h={60} tilt={3} fill="#fffbeb">
        <path d="M23 18c-3-5-10-2-8 3 1 3 5 6 8 8 3-2 7-5 8-8 2-5-5-8-8-3z" fill="#e11d48" />
        <Bar x={10} y={34} w={26} h={3} fill="#9f1239" />
        <Bar x={14} y={40} w={18} fill="#d6a4ae" />
      </Sheet>
      <g transform="rotate(-4 68 66)">
        <rect x={32} y={45} width={74} height={44} rx={3} fill="#fb7185" />
        <path d="M32 47l37 22 37-22v42H32z" fill="#f43f5e" />
        <path d="M32 89l27-27m47 27L79 62" stroke="#be123c" strokeOpacity={0.4} />
      </g>
    </>
  ),
  businessCard: (
    <>
      <Sheet x={30} y={14} w={70} h={42} tilt={-9} fill="#18181b">
        <rect x={7} y={7} width={11} height={11} rx={2} fill="#fbbf24" />
        <Bar x={7} y={26} w={30} fill="#a1a1aa" />
      </Sheet>
      <Sheet x={36} y={36} w={72} h={44} tilt={5} fill="#fef9ec">
        <rect x={7} y={8} width={11} height={11} rx={5.5} fill="#ca8a04" />
        <Bar x={7} y={25} w={36} h={4} fill={INK} />
        <Bar x={7} y={33} w={24} fill="#a8a29e" />
      </Sheet>
    </>
  ),
  cv: (
    <>
      <Sheet x={28} y={14} w={54} h={70} tilt={-8} fill="#5eead4" />
      <Sheet x={44} y={8} w={58} h={78} tilt={4}>
        <path d="M0 3a3 3 0 0 1 3-3h17v78H3a3 3 0 0 1-3-3z" fill="#0f766e" />
        <circle cx={10} cy={12} r={6} fill="#fcd34d" />
        <path d="M4 22a6 6 0 0 1 12 0z" fill="#fcd34d" />
        <Bar x={4} y={30} w={12} fill="#99f6e4" />
        <Bar x={4} y={36} w={9} fill="#99f6e4" />
        <Bar x={4} y={42} w={11} fill="#99f6e4" />
        <Bar x={25} y={7} w={26} h={4} fill={INK} />
        <Bar x={25} y={15} w={18} />
        <Bar x={25} y={26} w={14} h={3} fill="#0f766e" />
        <Bar x={25} y={33} w={28} />
        <Bar x={25} y={39} w={24} />
        <Bar x={25} y={50} w={14} h={3} fill="#0f766e" />
        <Bar x={25} y={57} w={28} />
        <Bar x={25} y={63} w={20} />
      </Sheet>
    </>
  ),
  certificate: (
    <>
      <Sheet x={36} y={8} w={70} h={48} tilt={-8} fill="#fde68a" />
      <Sheet x={28} y={20} w={80} h={56} tilt={2} fill="#fffdf5">
        <rect x={3} y={3} width={74} height={50} rx={1.5} fill="none" stroke="#b45309" strokeWidth={1} />
        <Bar x={22} y={11} w={36} h={4} fill={INK} />
        <Bar x={16} y={20} w={48} fill="#a8a29e" />
        <Bar x={24} y={26} w={32} fill="#a8a29e" />
        <path d="M34 41l-3 11 6-3 6 3-3-11z" fill="#1d4ed8" />
        <circle cx={37} cy={38} r={7} fill="#f59e0b" />
        <circle cx={37} cy={38} r={4} fill="#fde68a" />
      </Sheet>
    </>
  ),
  social: (
    <>
      <Sheet x={24} y={22} w={44} h={52} tilt={-9} fill="#fde047">
        <Bar x={6} y={8} w={26} h={5} fill={INK} />
        <Bar x={6} y={17} w={20} h={5} fill={INK} />
      </Sheet>
      <Sheet x={68} y={18} w={44} h={52} tilt={9} fill="#38bdf8">
        <circle cx={22} cy={22} r={11} fill="#fff" />
      </Sheet>
      <Sheet x={44} y={14} w={46} h={58} tilt={1} r={4} fill="url(#art-rose)">
        <path d="M23 21c-3-5-10-2-8 3 1 3 5 6 8 8 3-2 7-5 8-8 2-5-5-8-8-3z" fill="#fff" />
        <Bar x={9} y={40} w={28} h={3} fill="#fff" />
        <circle cx={18} cy={50} r={1.3} fill="#fff" />
        <circle cx={23} cy={50} r={1.3} fill="#fff" opacity={0.5} />
        <circle cx={28} cy={50} r={1.3} fill="#fff" opacity={0.5} />
      </Sheet>
    </>
  ),
  budget: (
    <>
      <Sheet x={26} y={14} w={60} h={62} tilt={-7} fill="#86efac" />
      <Sheet x={34} y={12} w={74} h={70} tilt={3}>
        <path d="M0 3a3 3 0 0 1 3-3h68a3 3 0 0 1 3 3v10H0z" fill="#15803d" />
        <Bar x={5} y={5} w={18} fill="#fff" />
        <Bar x={33} y={5} w={12} fill="#fff" />
        <Bar x={55} y={5} w={12} fill="#fff" />
        {[18, 28, 38].map((y) => (
          <g key={y}>
            <Bar x={5} y={y} w={20} fill="#71717a" />
            <Bar x={33} y={y} w={14} />
            <Bar x={55} y={y} w={14} />
          </g>
        ))}
        <path d="M0 24h74M0 34h74M0 44h74M29 13v44M51 13v44" stroke="#e4e4e7" strokeWidth={0.75} />
        <rect y={46} width={74} height={11} fill="#dcfce7" />
        <Bar x={5} y={50} w={14} h={3} fill="#15803d" />
        <Bar x={55} y={50} w={14} h={3} fill="#15803d" />
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
