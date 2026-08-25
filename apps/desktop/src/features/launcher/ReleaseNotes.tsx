import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const REMARK_PLUGINS = [remarkGfm];

/**
 * Its own module so `React.lazy` can keep the markdown pipeline out of the
 * launcher's entry chunk: micromark + hast were being parsed on every launcher
 * start for one release-notes panel most sessions never open.
 */
export default function ReleaseNotes({ notes }: { notes: string }) {
  return <Markdown remarkPlugins={REMARK_PLUGINS}>{notes}</Markdown>;
}
