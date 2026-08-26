import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePreviewPanel } from "./usePreviewPanel";

const A = "<p>a</p>";
const B = "<p>b</p>";

describe("usePreviewPanel", () => {
  it("закрыта и пуста при старте", () => {
    const { result } = renderHook(() => usePreviewPanel());
    expect(result.current.previewOpen).toBe(false);
    expect(result.current.previewHtml).toBe("");
  });

  it("openPreview открывает и подменяет содержимое, но никогда не закрывает", () => {
    const { result } = renderHook(() => usePreviewPanel());
    act(() => {
      result.current.openPreview(A);
    });
    act(() => {
      result.current.openPreview(A);
    });
    expect(result.current.previewOpen).toBe(true);
    expect(result.current.previewHtml).toBe(A);
  });

  // Нажатие по чипу ТОГО ЖЕ блока закрывает панель, по чипу другого —
  // переключает содержимое: иначе второй чип выглядел бы неработающим.
  it("togglePreview закрывает свой блок и подменяет чужой", () => {
    const { result } = renderHook(() => usePreviewPanel());
    act(() => {
      result.current.togglePreview(A);
    });
    expect(result.current.previewOpen).toBe(true);
    act(() => {
      result.current.togglePreview(B);
    });
    expect(result.current.previewOpen).toBe(true);
    expect(result.current.previewHtml).toBe(B);
    act(() => {
      result.current.togglePreview(B);
    });
    expect(result.current.previewOpen).toBe(false);
  });

  it("closePreview закрывает, сохраняя содержимое", () => {
    const { result } = renderHook(() => usePreviewPanel());
    act(() => {
      result.current.openPreview(A);
    });
    act(() => {
      result.current.closePreview();
    });
    expect(result.current.previewOpen).toBe(false);
    expect(result.current.previewHtml).toBe(A);
  });

  it("колбэки стабильны между рендерами — они уходят в дерево, которое перерисовывается каждый кадр", () => {
    const { result, rerender } = renderHook(() => usePreviewPanel());
    const first = result.current;
    rerender();
    expect(result.current.openPreview).toBe(first.openPreview);
    expect(result.current.togglePreview).toBe(first.togglePreview);
    expect(result.current.closePreview).toBe(first.closePreview);
  });
});
