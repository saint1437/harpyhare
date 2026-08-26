"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen locale="ru" {...props} />;
}
