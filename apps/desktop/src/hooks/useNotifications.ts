import { useSyncExternalStore } from "react";
import {
  getNotifications,
  subscribeNotifications,
  type AppNotification,
} from "@/lib/notifications";

/**
 * The React half of the module-level store (`lib/notifications`). It is a
 * subscription and nothing else: raising a notification is an ordinary function
 * call from anywhere, including outside React, which is the whole point.
 */
export function useNotifications(): readonly AppNotification[] {
  return useSyncExternalStore(subscribeNotifications, getNotifications);
}
