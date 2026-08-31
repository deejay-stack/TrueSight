import { useEffect, useMemo, useRef } from "react";
import {
  Bell,
  CalendarClock,
  Check,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { ActivityNotification } from "../services/classService";

type ActivityNotificationsPopoverProps = {
  notifications: ActivityNotification[];
  open: boolean;
  loading: boolean;
  onToggle: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onMarkRead?: (notificationId: string) => void;
  onDelete?: (notificationId: string) => void;
  onNotificationClick?: (notification: ActivityNotification) => void;
};

const formatEventTime = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString();
};

export function ActivityNotificationsPopover({
  notifications,
  open,
  loading,
  onToggle,
  onClose,
  onRefresh,
  onMarkRead,
  onDelete,
  onNotificationClick,
}: ActivityNotificationsPopoverProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!containerRef.current.contains(target)) {
        onClose();
      }
    };

    window.addEventListener("mousedown", handleOutside);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
    };
  }, [open, onClose]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.status === "unread").length,
    [notifications],
  );

  useEffect(() => {
    if (!open || !onMarkRead) return;

    notifications
      .filter((notification) => notification.status === "unread")
      .forEach((notification) => onMarkRead(notification.id));
  }, [notifications, onMarkRead, open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={onToggle}
        className="theme-ring inline-flex h-10 w-10 items-center justify-center rounded-xl border theme-border text-[var(--app-muted)] hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] active:scale-90"
      >
        <Bell className="h-5 w-5" />
      </button>
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}

      {open && (
        <div className="theme-surface notification-popover !fixed inset-x-3 top-20 z-50 w-auto rounded-2xl p-3 shadow-[var(--app-shadow)] sm:!absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(92vw,360px)]">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--app-text)]">Notifications</p>
              <p className="text-[11px] theme-muted">
                {unreadCount} unread - {notifications.length} total
              </p>
            </div>
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs theme-muted hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]"
            >
              <RefreshCw className={["h-3.5 w-3.5", loading ? "animate-spin" : ""].join(" ")} />
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="rounded-xl border theme-border p-3 text-xs theme-muted">
              Loading notifications...
            </p>
          ) : notifications.length === 0 ? (
            <p className="rounded-xl border border-dashed theme-border p-3 text-xs theme-muted">
              No notifications yet.
            </p>
          ) : (
            <div className="max-h-[calc(100vh-12rem)] space-y-2 overflow-y-auto pr-1 sm:max-h-80">
              {notifications.map((notification) => {
                const clickable = Boolean(onNotificationClick && notification.activityId);

                return (
                  <div
                    key={notification.id}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={() => {
                      if (clickable) {
                        onNotificationClick?.(notification);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (!clickable) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onNotificationClick?.(notification);
                      }
                    }}
                    className={[
                      "rounded-xl border p-3 transition",
                      clickable
                        ? "cursor-pointer hover:border-[color-mix(in_srgb,var(--app-accent)_55%,var(--app-border))] hover:shadow-[var(--app-shadow)]"
                        : "",
                      notification.status === "unread"
                        ? "border-[color-mix(in_srgb,var(--app-accent)_45%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-accent)_10%,var(--app-surface))]"
                        : "theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)]",
                    ].join(" ")}
                  >
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {notification.type === "new_submission" ? (
                        <Send className="h-4 w-4 text-[var(--app-accent)]" />
                      ) : notification.type === "new_activity" ? (
                        <Sparkles className="h-4 w-4 text-[var(--app-accent)]" />
                      ) : notification.severity === "warning" ? (
                        <TriangleAlert className="h-4 w-4 text-rose-300" />
                      ) : (
                        <CalendarClock className="h-4 w-4 text-amber-300" />
                      )}
                      <p className="text-xs font-semibold text-[var(--app-text)]">
                        {notification.title}
                      </p>
                    </div>
                    <span className="shrink-0 text-right text-[10px] theme-muted">
                      {formatEventTime(notification.eventAt)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--app-text)]">{notification.message}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] theme-muted">
                      {notification.className} | {notification.activityTitle}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full border theme-border px-2 py-0.5 text-[10px] font-semibold theme-muted">
                        {notification.status}
                      </span>
                      {notification.status === "unread" && onMarkRead && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onMarkRead(notification.id);
                          }}
                          className="theme-ring inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--app-muted)] hover:bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] hover:text-[var(--app-accent)]"
                          aria-label="Mark notification as read"
                          title="Mark as read"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(notification.id);
                          }}
                          className="theme-ring inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--app-muted)] hover:bg-rose-500/10 hover:text-rose-300"
                          aria-label="Delete notification"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
