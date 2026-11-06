import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Blocks, Brain, CalendarClock, ChevronRight, Columns3, House, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Kbd } from "@/components/kbd";
import { StarCard } from "@/components/layout/star-card";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useLayout } from "@/context/layout-provider";
import { useSearch } from "@/context/search-provider";
import { UpdateButton, useUpdateAvailable } from "@/features/config/update-dialog";
import { isMac, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useRuns } from "@/stores/runs";

export function AppSidebar() {
  const { collapsible, variant } = useLayout();
  const { setOpenMobile } = useSidebar();
  const { setOpen: openSearch } = useSearch();
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const close = () => setOpenMobile(false);
  const { navRef, pillRef } = useSlidingPill(pathname);

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader className="h-14 flex-row items-center justify-between px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
        <Link
          to="/"
          onClick={close}
          className="flex items-center gap-2 rounded-md px-1 brand-title text-[15px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <LogoMark />
          <span className="group-data-[collapsible=icon]:hidden">Satgas</span>
        </Link>
        <Button
          size="icon-sm"
          className="group-data-[collapsible=icon]:hidden"
          aria-label={t.newMission}
          title={`${t.newMission} (N)`}
          onClick={() => {
            close();
            void navigate({ to: "/" }).then(() => document.getElementById("mission")?.focus());
          }}
        >
          <Plus />
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup ref={navRef} className="isolate">
          <span
            ref={pillRef}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 -z-10 rounded-md bg-sidebar-accent opacity-0 transition-[transform,width,height,opacity] duration-200 ease-out motion-reduce:transition-none"
          />
          <SidebarMenu className="[&_[data-active=true]]:!bg-transparent">
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={t.search} onClick={() => openSearch(true)} aria-keyshortcuts="Meta+K Control+K">
                <Search />
                <span>{t.search}</span>
              </SidebarMenuButton>
              <SidebarMenuBadge>
                <Kbd>{isMac ? "⌘K" : "Ctrl K"}</Kbd>
              </SidebarMenuBadge>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/"} tooltip={t.home}>
                <Link to="/" onClick={close}>
                  <House />
                  <span>{t.home}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/pipeline"} tooltip={t.pipeline.title}>
                <Link to="/pipeline" onClick={close}>
                  <Columns3 />
                  <span>{t.pipeline.title}</span>
                </Link>
              </SidebarMenuButton>
              <LiveBoards />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/schedules"} tooltip={t.schedules.title}>
                <Link to="/schedules" onClick={close}>
                  <CalendarClock />
                  <span>{t.schedules.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/memory"} tooltip={t.memory.title}>
                <Link to="/memory" onClick={close}>
                  <Brain />
                  <span>{t.memory.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/integrations"} tooltip={t.integrations.title}>
                <Link to="/integrations" onClick={close}>
                  <Blocks />
                  <span>{t.integrations.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <ConfigNav pathname={pathname} onPick={close} />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-3">
        <UpdateButton />
        <Promo />
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <ConnectionStatus />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

// One highlight that travels to whichever row is active, instead of each row lighting up on its own. Only a change of page
// slides it: when the list itself changes shape, like the sidebar folding or a submenu opening, it just stays on its row.
function useSlidingPill(pathname: string) {
  const navRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(false);
  const place = useCallback((slide: boolean) => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;
    const row = nav.querySelector<HTMLElement>('[data-active="true"]');
    if (!row) {
      pill.style.opacity = "0";
      shown.current = false;
      return;
    }
    const from = nav.getBoundingClientRect();
    const to = row.getBoundingClientRect();
    // The first time it has somewhere to be, it appears there rather than flying in from the corner.
    pill.style.transition = slide && shown.current ? "" : "none";
    pill.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px)`;
    pill.style.width = `${to.width}px`;
    pill.style.height = `${to.height}px`;
    pill.style.opacity = "1";
    shown.current = true;
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page is exactly what moves it.
  useLayoutEffect(() => place(true), [pathname, place]);
  useEffect(() => {
    if (!navRef.current) return;
    const watch = new ResizeObserver(() => place(false));
    watch.observe(navRef.current);
    return () => watch.disconnect();
  }, [place]);
  return { navRef, pillRef };
}

const CONFIG_PAGES = [
  { to: "/config/settings", label: t.config.settings },
  { to: "/config/usage", label: t.config.usage },
  { to: "/config/about", label: t.config.about },
] as const;

// Opens under itself; with the sidebar folded to icons there is no room for that, so its pages come as a menu.
function ConfigNav({ pathname, onPick }: { pathname: string; onPick: () => void }) {
  const { state, isMobile } = useSidebar();
  const inside = pathname.startsWith("/config");
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);
  if (state === "collapsed" && !isMobile)
    return (
      <SidebarMenuItem>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton isActive={inside} tooltip={t.config.title} aria-label={t.config.title}>
              <SlidersHorizontal />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            {CONFIG_PAGES.map((p) => (
              <DropdownMenuItem key={p.to} asChild>
                <Link to={p.to}>{p.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  return (
    <SidebarMenuItem>
      <SidebarMenuButton aria-expanded={open} onClick={() => setOpen((v) => !v)} tooltip={t.config.title}>
        <SlidersHorizontal />
        <span>{t.config.title}</span>
        <ChevronRight className={cn("ms-auto transition-transform", open && "rotate-90")} />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {CONFIG_PAGES.map((p) => (
            <SidebarMenuSubItem key={p.to}>
              <SidebarMenuSubButton asChild isActive={pathname === p.to}>
                <Link to={p.to} onClick={onPick}>
                  <span>{p.label}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

function Promo() {
  return useUpdateAvailable() ? null : <StarCard />;
}

function ConnectionStatus() {
  const conn = useRuns((s) => s.conn);
  const version = useRuns((s) => s.config.version);
  const label = conn === "open" ? t.connected : conn === "connecting" ? t.connecting : t.offline;
  return (
    <div role="status" title={label} className="flex min-w-0 flex-1 items-center gap-2 px-2 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          conn === "open" ? "bg-emerald-500" : conn === "connecting" ? "bg-muted-foreground/50" : "bg-destructive",
        )}
      />
      <span className={cn("truncate group-data-[collapsible=icon]:sr-only", conn === "closed" && "text-destructive")}>{label}</span>
      {version && <span className="ms-auto tabular-nums group-data-[collapsible=icon]:hidden">v{version}</span>}
    </div>
  );
}

// How many boards have their team at work right now, from the run list the sidebar already has.
function LiveBoards() {
  const n = useRuns((s) => s.runs?.filter((r) => r.status === "planning" || r.status === "running").length ?? 0);
  if (!n) return null;
  return (
    <SidebarMenuBadge title={t.pipeline.live(n)} className="text-signal-ink tabular-nums">
      {n}
    </SidebarMenuBadge>
  );
}
