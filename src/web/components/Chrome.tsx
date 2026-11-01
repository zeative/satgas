import { modKey, t } from "../i18n";
import logo from "../icon.svg";
import { appVersion, concurrency, conn, currentId, run } from "../state";
import { paletteOpen, sidebarOpen, theme, toggleSidebar, toggleTheme } from "../ui";
import { Icon } from "./Icon";

export function Topbar() {
  const r = run.value;
  const id = currentId.value;
  const crumb = id ? (r?.title ?? r?.prompt ?? "") : t.newMission;
  return (
    <header class="topbar">
      <div class="topbar-brand">
        <button
          type="button"
          class="icon-btn"
          aria-label={t.toggleSidebar}
          title={`${t.toggleSidebar} (${modKey} \\)`}
          aria-expanded={sidebarOpen.value}
          aria-controls="sidebar"
          onClick={() => toggleSidebar()}
        >
          <Icon name="sidebar" />
        </button>
        <a class="brand-mark" href="#/new">
          <img src={logo} width="20" height="20" alt="" />
          Satgas
        </a>
      </div>
      <nav class="crumbs" aria-label="Breadcrumb">
        {id ? (
          <>
            <a class="crumbs-link" href="#/new">
              {t.missions}
            </a>
            <span class="crumbs-sep" aria-hidden="true">
              /
            </span>
            <span class="crumbs-current" aria-current="page">
              {crumb}
            </span>
          </>
        ) : (
          <span class="crumbs-current" aria-current="page">
            {crumb}
          </span>
        )}
      </nav>
      <div class="topbar-actions">
        <button type="button" class="search-trigger" onClick={() => (paletteOpen.value = true)} aria-label={t.search}>
          <Icon name="search" size={14} />
          <span class="search-label">{t.search}</span>
          <kbd>{modKey} K</kbd>
        </button>
        <button
          type="button"
          class="icon-btn"
          onClick={toggleTheme}
          aria-label={theme.value === "night" ? t.themeChart : t.themeNight}
          title={theme.value === "night" ? t.themeChart : t.themeNight}
        >
          <Icon name={theme.value === "night" ? "sun" : "moon"} />
        </button>
      </div>
    </header>
  );
}

export function StatusBar() {
  const r = run.value;
  const state = conn.value;
  const slots = concurrency.value;
  const busy = r?.nodes.filter((n) => n.status === "running").length ?? 0;
  const label = state === "open" ? t.connected : state === "connecting" ? t.connecting : t.offline;
  return (
    <footer class="statusbar">
      <span class={`statusbar-item${state === "closed" ? " is-offline" : state === "connecting" ? " is-connecting" : ""}`} role="status">
        <span class="link-dot" aria-hidden="true" />
        {label}
      </span>
      {r && slots !== null && (
        <span class="statusbar-item" title={`${busy}/${slots}`}>
          {t.slots}
          <span class="slots" aria-hidden="true">
            {Array.from({ length: slots }, (_, i) => (
              <span key={i} class={`slot${i < busy ? " is-busy" : ""}`} />
            ))}
          </span>
          <span class="num">
            {busy}/{slots}
          </span>
        </span>
      )}
      {r && <span class="statusbar-item statusbar-path">{r.cwd}</span>}
      {appVersion.value && <span class="statusbar-item statusbar-end">v{appVersion.value}</span>}
    </footer>
  );
}
