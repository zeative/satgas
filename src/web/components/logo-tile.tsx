import { cn } from "@/lib/utils";

export interface Logo {
  src: string;
  dark?: string;
  icon?: boolean;
}

const SIZE = { sm: "size-12 rounded-xl", lg: "size-16 rounded-2xl" } as const;
const MARK = { sm: "size-6", lg: "size-9" } as const;

// Bare marks sit on a quiet bordered tile; app icons are the tile itself, full bleed, the way an OS shows them.
export function LogoTile({ logo, size = "sm", fallback }: { logo?: Logo; size?: "sm" | "lg"; fallback?: React.ReactNode }) {
  if (logo?.icon) return <img src={logo.src} alt="" draggable={false} className={cn("shrink-0 border object-cover", SIZE[size])} />;
  return (
    <span className={cn("flex shrink-0 items-center justify-center border bg-background", SIZE[size])}>
      {logo ? (
        <>
          <img src={logo.src} alt="" draggable={false} className={cn("object-contain", MARK[size], logo.dark && "dark:hidden")} />
          {logo.dark && <img src={logo.dark} alt="" draggable={false} className={cn("hidden object-contain dark:block", MARK[size])} />}
        </>
      ) : (
        fallback
      )}
    </span>
  );
}
