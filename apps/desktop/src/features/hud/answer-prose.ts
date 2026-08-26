/**
 * The one prose class shared by a finished answer and a live stream. It lives in
 * its own module because the two renderers are on opposite sides of a `lazy`
 * boundary: importing it from `AnswerMarkdown` would drag the whole markdown
 * pipeline back into the eager chunk, and importing it from `AnswerPanel` would
 * be a cycle.
 *
 * `AnswerPanel.test.tsx` asserts the two class strings are identical — while the
 * assistant's buttons had a reserved gutter, the streaming half had to repeat
 * its width by hand and the two silently drifted apart along the right edge.
 */
export const ASSISTANT_PROSE_CLASS = "prose-answer text-chat leading-relaxed text-fg/90";
