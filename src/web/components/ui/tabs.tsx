import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot='tabs'
      className={cn('flex max-w-full min-w-0 flex-col gap-2', className)}
      {...props}
    />
  )
}

// Slides one mark to the chosen tab. A tab's size changing, like fonts loading or a panel being resized, moves it without
// the slide, and so does the first placement, so it appears in place rather than flying in from the corner.
function useTabMark() {
  const list = React.useRef<HTMLDivElement>(null)
  const mark = React.useRef<HTMLSpanElement>(null)
  React.useLayoutEffect(() => {
    const el = list.current
    const dot = mark.current
    if (!el || !dot) return
    let shown = false
    const place = (slide: boolean) => {
      const active = el.querySelector<HTMLElement>(
        '[data-slot="tabs-trigger"][data-state="active"]'
      )
      if (!active?.offsetWidth) {
        dot.style.opacity = '0'
        shown = false
        return
      }
      dot.style.transition = slide && shown ? '' : 'none'
      dot.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`
      dot.style.width = `${active.offsetWidth}px`
      dot.style.height = `${active.offsetHeight}px`
      dot.style.opacity = '1'
      shown = true
      // A row too long for a phone scrolls, and the chosen tab stays in sight.
      if (el.scrollWidth > el.clientWidth)
        el.scrollTo({ left: active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2, behavior: slide ? 'smooth' : 'auto' })
    }
    place(false)
    const chosen = new MutationObserver(() => place(true))
    chosen.observe(el, { subtree: true, attributes: true, attributeFilter: ['data-state'] })
    const sized = new ResizeObserver(() => place(false))
    sized.observe(el)
    return () => {
      chosen.disconnect()
      sized.disconnect()
    }
  }, [])
  return { list, mark }
}

// Compact scale: plain-word tabs, 28px, with a soft pill that slides to the chosen one; markClassName restyles that pill.
function TabsList({
  className,
  markClassName,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { markClassName?: string }) {
  const { list, mark } = useTabMark()
  return (
    <TabsPrimitive.List
      ref={list}
      data-slot='tabs-list'
      className={cn(
        'no-scrollbar relative isolate inline-flex h-7 w-fit max-w-full items-center gap-1 overflow-x-auto text-muted-foreground',
        className
      )}
      {...props}
    >
      <span
        ref={mark}
        aria-hidden='true'
        className={cn(
          'pointer-events-none absolute top-0 left-0 -z-10 rounded-lg bg-muted opacity-0 transition-[transform,width,height,opacity] duration-200 ease-out motion-reduce:transition-none',
          markClassName
        )}
      />
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot='tabs-trigger'
      className={cn(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot='tabs-content'
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
