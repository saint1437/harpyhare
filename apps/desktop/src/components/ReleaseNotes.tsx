import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const REMARK_PLUGINS = [remarkGfm];

/**
 * Its own module so `React.lazy` can keep the markdown pipeline out of BOTH
 * entry chunks: micromark + hast were being parsed on every launcher start for
 * a panel most sessions never open — and, through `UpdateDialog`, on every HUD
 * start as well, which is what kept `vendor-markdown` in the HUD's preload list
 * even after the answer panel's own pipeline went behind `lazy`.
 *
 * Shared by both windows, so it lives in the common zone rather than in either
 * feature.
 */
export default function ReleaseNotes({ notes }: { notes: string }) {
  return <Markdown remarkPlugins={REMARK_PLUGINS}>{notes}</Markdown>;
}
