import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { OutboundLink } from "@/components/outbound-link";
import { RichText } from "@/components/rich-text";
import { t } from "@/i18n";

// One detail page shape for connectors and agents: back link, identity and action, then the story beside the facts.
export function DetailPage({
  back,
  onBack,
  logo,
  title,
  desc,
  action,
  aside,
  children,
}: {
  back: string;
  onBack: () => void;
  logo: React.ReactNode;
  title: string;
  desc: string;
  action?: React.ReactNode;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        aria-label={t.backTo(back)}
        className="-ms-2 inline-flex h-7 w-fit items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {back}
      </button>
      <header className="flex flex-wrap items-center gap-4">
        {logo}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="brand-title text-2xl leading-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            <RichText text={desc} />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      </header>
      <hr className="border-border" />
      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-w-0 flex-col gap-8">{children}</div>
        <aside>
          <dl className="flex flex-col gap-5">{aside}</dl>
        </aside>
      </div>
    </div>
  );
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function ExternalText({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <OutboundLink
      href={href}
      className="inline-flex items-center gap-1 rounded underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
      <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </OutboundLink>
  );
}

export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}
