import { useEffect, useState } from "react";
import { LiveRegion } from "@/components/LiveRegion";
import { NotificationCard } from "@/components/NotificationCard";
import { useNotifications } from "@/hooks/useNotifications";
import {
  dismissNotification,
  notificationAnnouncement,
  pauseNotifications,
  resumeNotifications,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

/**
 * The window's one live notification surface. It sits IN FLOW rather than over
 * the interface — in the HUD directly above the composer, exactly where
 * `AutoTranscript` already appears, and in the launcher under the launch bar
 * where the error banner used to be. In a 400-point-wide always-on-top window
 * every floating layer covers either the status object ("am I being heard?") or
 * the input field; in flow the answer panel merely gives up some height and
 * takes it back when the notification goes.
 *
 * Which is also why the visible container is NOT rendered while the stack is
 * empty, and why the announcer is a separate `LiveRegion`: an empty flex child
 * is still a flex item and would take a permanent `gap` out of both windows'
 * columns forever. `LiveRegion` is `sr-only`, that is absolutely positioned, so
 * it is not a flex item at all — and it stays mounted, which a live region has
 * to be to be announced reliably.
 */
export function NotificationStack({ className }: { className?: string }) {
  const items = useNotifications();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);

  // Only one body is open at a time, so "is someone reading" is one id rather
  // than a set that has to be pruned every time a card expires.
  const reading = hovered || items.some((item) => item.id === expandedId);

  useEffect(() => {
    if (!reading) return undefined;
    pauseNotifications();
    return resumeNotifications;
  }, [reading]);

  // Dismissing the last card removes the container from under the pointer, and
  // mouseleave never fires for a removed node: a stale `hovered` kept the store
  // paused, and the NEXT notification arrived frozen — countdown parked before
  // anyone touched it — until a hover in and out over the new stack.
  useEffect(() => {
    if (items.length > 0) return;
    setHovered(false);
    setExpandedId(null);
  }, [items.length]);

  const newest = items.at(-1);

  return (
    <>
      <LiveRegion message={newest === undefined ? "" : notificationAnnouncement(newest)} />
      {items.length > 0 && (
        <div
          className={cn("flex shrink-0 flex-col gap-1.5", className)}
          onMouseEnter={() => {
            setHovered(true);
          }}
          onMouseLeave={() => {
            setHovered(false);
          }}
        >
          {items.map((item) => (
            <NotificationCard
              // The life bar is a CSS animation, so a repeat has to remount the
              // bar to restart it — that is what the count in the key buys.
              key={`${item.id}:${String(item.count)}`}
              tone={item.tone}
              title={item.title}
              detail={item.detail}
              count={item.count}
              life={{ durationMs: item.lifetimeMs, paused: reading }}
              expanded={expandedId === item.id}
              onToggleExpanded={() => {
                setExpandedId((current) => (current === item.id ? null : item.id));
              }}
              onDismiss={() => {
                dismissNotification(item.id);
              }}
              className="animate-in duration-150 fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
            />
          ))}
        </div>
      )}
    </>
  );
}
