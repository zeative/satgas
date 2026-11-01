import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Blocks, House, Plus, Search } from "lucide-react";
import { Kbd } from "@/components/kbd";
import { LogoMark } from "@/components/logo";
import { ThemeSwitch } from "@/components/theme-switch";
import { Button } from "@/components/ui/button";
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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useLayout } from "@/context/layout-provider";
import { useSearch } from "@/context/search-provider";
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
        <SidebarGroup>
          <SidebarMenu>
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
              <SidebarMenuButton asChild isActive={pathname === "/integrations"} tooltip={t.integrations.title}>
                <Link to="/integrations" onClick={close}>
                  <Blocks />
                  <span>{t.integrations.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col">
        <ConnectionStatus />
        <ThemeSwitch className="size-7 shrink-0 text-muted-foreground hover:text-foreground" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
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
