import type { NodeStatus, RunStatus } from "../../shared/types";

type Status = NodeStatus | RunStatus;

// Each status has a distinct shape, so it never relies on color alone.
export function StatusGlyph({ status, size = 14 }: { status: Status; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true, class: `glyph glyph-${status}` };
  switch (status) {
    case "running":
    case "planning":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.75" stroke="currentColor" stroke-opacity=".22" stroke-width="1.75" />
          <path class="spin" d="M8 2.25A5.75 5.75 0 0 1 13.75 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        </svg>
      );
    case "done":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path d="M5.25 8.25 7.1 10.1 10.85 6.1" stroke="var(--paper)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      );
    case "failed":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path d="M8 4.9v3.6" stroke="var(--paper)" stroke-width="1.6" stroke-linecap="round" />
          <circle cx="8" cy="10.9" r=".95" fill="var(--paper)" />
        </svg>
      );
    case "skipped":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.75" stroke="currentColor" stroke-width="1.4" />
          <path d="M4.2 11.8 11.8 4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      );
    case "cancelled":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.75" stroke="currentColor" stroke-width="1.4" />
          <rect x="5.9" y="5.9" width="4.2" height="4.2" rx=".8" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.75" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.2 2.4" />
        </svg>
      );
  }
}

const paths = {
  plus: "M8 3.25v9.5M3.25 8h9.5",
  minus: "M3.25 8h9.5",
  search: "M11.25 7a4.25 4.25 0 1 1-8.5 0 4.25 4.25 0 0 1 8.5 0ZM10.2 10.2 13.25 13.25",
  sun: "M10.75 8a2.75 2.75 0 1 1-5.5 0 2.75 2.75 0 0 1 5.5 0ZM8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9",
  moon: "M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z",
  more: "M3.75 8h.01M8 8h.01M12.25 8h.01",
  folder: "M2.25 4.75c0-.83.67-1.5 1.5-1.5h2.6l1.4 1.5h4.5c.83 0 1.5.67 1.5 1.5v5.5c0 .83-.67 1.5-1.5 1.5h-8.5c-.83 0-1.5-.67-1.5-1.5v-7Z",
  sidebar: "M3.75 2.75h8.5c.55 0 1 .45 1 1v8.5c0 .55-.45 1-1 1h-8.5c-.55 0-1-.45-1-1v-8.5c0-.55.45-1 1-1ZM6.25 2.75v10.5",
  back: "M9.75 4 5.75 8l4 4",
  arrow: "M3.25 8h9.5M9 4.25 12.75 8 9 11.75",
  copy: "M6 6h6.25v6.25H6zM4 10V3.75h6.25",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5",
  rerun: "M12.75 8a4.75 4.75 0 1 1-1.4-3.37M12.75 3v2.25H10.5",
  stop: "M5.25 5.25h5.5v5.5h-5.5z",
  fit: "M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3",
  enter: "M12.5 3.5v5a1.5 1.5 0 0 1-1.5 1.5H4M6.5 7.5 4 10l2.5 2.5",
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, class: className }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg class={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={paths[name]}
        stroke="currentColor"
        stroke-width={name === "more" ? 2.25 : 1.5}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
