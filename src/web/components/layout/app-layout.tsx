import { Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SkipToMain } from "@/components/skip-to-main";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { LayoutProvider } from "@/context/layout-provider";
import { getCookie } from "@/lib/cookies";

// The dashboard shell; boards open full screen outside it.
export function AppLayout() {
  const defaultOpen = getCookie("sidebar_state") !== "false";
  return (
    <LayoutProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <SkipToMain />
        <AppSidebar />
        <SidebarInset className="@container/content">
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </LayoutProvider>
  );
}
