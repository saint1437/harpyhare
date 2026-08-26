import { Check, ChevronDown, ChevronUp, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/IconButton";
import { StateBadge } from "@/components/StateBadge";
import { Button } from "@/components/ui/button";
import { useDict } from "@/hooks/useDict";
import { isDetailClamped, notificationBody, type NotificationTone } from "@/lib/notifications";
import { cn } from "@/lib/utils";

/**
 * One card, two mounts: the floating stack and — pinned, with no countdown and
 * no close button — the update surfaces, where the error has to stay put next to
 * its «Повторить». Everything that makes an oversized message survivable lives
 * here and nowhere else: two clamped lines, «Подробнее» with a scrolling body,
 * and «Копировать» for the slab of JSON nobody is going to read on screen.
 */
export interface NotificationCardProps {
  tone: NotificationTone;
  title: string;
  detail: string;
  /** How many identical notifications collapsed into this one. */
  count?: number;
  /** The countdown bar. `null` pins the card — see the pinned mount above. */
  life?: { durationMs: number; paused: boolean } | null;
  /** Absent together with `life` on a pinned card: there is nothing to dismiss. */
  onDismiss?: () => void;
  /** Controlled by the stack, so that only one body is open at a time. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  className?: string;
}

const TONE_BAR: Record<NotificationTone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
};

const COPIED_FEEDBACK_MS = 1400;

function useCopyFeedback(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return {
    copied,
    copy: (text: string) => {
      void navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(false);
      }, COPIED_FEEDBACK_MS);
    },
  };
}

export function NotificationCard({
  tone,
  title,
  detail,
  count = 1,
  life = null,
  onDismiss,
  expanded,
  onToggleExpanded,
  className,
}: NotificationCardProps) {
  const dict = useDict();
  // Controlled by the stack, self-managed when pinned: the dialog has no second
  // card to keep in step, so it should not have to hold state for one.
  const [ownExpanded, setOwnExpanded] = useState(false);
  const open = expanded ?? ownExpanded;
  const toggle =
    onToggleExpanded ??
    (() => {
      setOwnExpanded((value) => !value);
    });

  const body = notificationBody(title, detail);
  const clamped = isDetailClamped(body);
  // Копируют, чтобы переслать или загуглить, а это про отказы. Под
  // подтверждением кнопка была бы просто шумом.
  const canCopy = tone !== "success" && body !== "";
  const { copied, copy } = useCopyFeedback();

  return (
    <div
      // В стопке карточку объявляет живая область самой стопки; приколотую
      // объявлять некому — она вставляется в уже открытый диалог.
      role={onDismiss === undefined ? "alert" : undefined}
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden rounded-lg bg-elevated ring-1 ring-inset ring-line",
        onDismiss !== undefined && "shadow-pop",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2 py-2 pr-1.5 pl-2.5">
        <StateBadge
          tone={tone}
          label={dict.common.notifications.toneTitles[tone]}
          labelHidden
          className="mt-0.5"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-body font-medium text-fg">{title}</span>
            {count > 1 && (
              <span className="shrink-0 rounded-sm bg-surface-active px-1 text-hint text-fg-subtle tabular-nums">
                ×{count}
              </span>
            )}
          </div>

          {body !== "" && (
            <p
              className={cn(
                "text-caption break-words whitespace-pre-wrap text-fg-muted",
                open ? "max-h-40 overflow-y-auto" : "line-clamp-2",
              )}
            >
              {body}
            </p>
          )}

          {(clamped || canCopy) && (
            <div className="-ml-1.5 flex items-center gap-0.5 pt-0.5">
              {clamped && (
                <Button variant="ghost" size="xs" className="text-fg-subtle" onClick={toggle}>
                  {open ? <ChevronUp /> : <ChevronDown />}
                  {open ? dict.common.actions.less : dict.common.actions.more}
                </Button>
              )}
              {canCopy && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-fg-subtle"
                  onClick={() => {
                    copy(`${title}\n${body}`);
                  }}
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? dict.common.actions.copied : dict.common.actions.copy}
                </Button>
              )}
            </div>
          )}
        </div>

        {onDismiss !== undefined && (
          <IconButton
            title={dict.common.notifications.dismiss}
            className="size-6"
            onClick={onDismiss}
          >
            <X />
          </IconButton>
        )}
      </div>

      {life !== null && (
        <span className="block h-0.5 w-full bg-inset" aria-hidden>
          {/* Ширина, а не transform: анимация трансформа поднимает элемент в
              отдельный слой WKWebView, а схлопывание такого слоя в прозрачном
              окне и оставляет тот самый мусор из непогашенных пикселей. */}
          <span
            className={cn("notification-life block h-full", TONE_BAR[tone])}
            style={{
              animationDuration: `${String(life.durationMs)}ms`,
              animationPlayState: life.paused ? "paused" : "running",
            }}
          />
        </span>
      )}
    </div>
  );
}
