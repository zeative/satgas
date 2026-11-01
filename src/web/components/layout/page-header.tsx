import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// Stays pinned while the page scrolls; -mb-12 keeps it floating over the page so backgrounds still run edge to edge.
export function PageHeader({ children, actions }: { children?: React.ReactNode; actions?: React.ReactNode }) {
  const scrolled = useScrolled();
  return (
    <header
      className={cn(
        "pointer-events-none sticky top-0 z-20 -mb-12 flex h-12 items-center gap-2 border-b px-3 transition-[background-color,border-color] duration-200 *:pointer-events-auto",
        // Transparent at the top; once content slides under it, a solid surface keeps the controls readable.
        scrolled ? "border-border bg-background" : "border-transparent",
      )}
    >
      <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
      {children && <div className="flex min-w-0 items-center gap-2 text-sm">{children}</div>}
      {actions && <div className="ms-auto flex items-center gap-1.5">{actions}</div>}
    </header>
  );
}

function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return scrolled;
}
