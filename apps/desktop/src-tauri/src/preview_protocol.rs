//! The `preview://` scheme serving the model's HTML answer.
//!
//! The content here is written by an LLM and is untrusted by construction. Its
//! isolation used to rest entirely on being a different origin from
//! `tauri://localhost` with no capability of its own — true, but nothing was
//! written down in the response itself, so a change to the iframe's `sandbox`
//! attribute or to the capability file would have quietly removed the only
//! barrier. These headers state the boundary at the source.

const HTML_UTF8_CONTENT_TYPE: &str = "text/html; charset=utf-8";

/// Deliberately permissive about how the page renders ITSELF — model answers
/// routinely use inline scripts and styles, and a preview that refuses to run
/// them is not a preview — and strict about where it may reach.
///
/// * `connect-src https:` keeps `fetch`/XHR on the public web and off the IPC
///   origins (`ipc:` / `http://ipc.localhost`), which is the one thing in reach
///   that would matter.
/// * `frame-src`/`object-src`/`frame-ancestors 'none'` stop the preview from
///   nesting anything or being nested anywhere.
/// * `form-action 'none'` — a generated login form must have nowhere to post.
const PREVIEW_CSP: &str = "default-src 'self' data: blob:; \
script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; \
style-src 'self' 'unsafe-inline' data: https:; \
img-src 'self' data: blob: https:; \
font-src 'self' data: https:; \
connect-src https:; \
frame-src 'none'; \
object-src 'none'; \
frame-ancestors 'none'; \
base-uri 'none'; \
form-action 'none'";

const CONTENT_SECURITY_POLICY: &str = "Content-Security-Policy";
const CONTENT_TYPE_OPTIONS: &str = "X-Content-Type-Options";
const NO_SNIFF: &str = "nosniff";
const REFERRER_POLICY: &str = "Referrer-Policy";
const NO_REFERRER: &str = "no-referrer";

/// Never panics: the builder only fails on a malformed header, and every value
/// here is a constant — but this runs inside the webview's protocol handler, and
/// a panic there kills the request thread rather than the page.
pub fn preview_response(html: &str) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .header(tauri::http::header::CONTENT_TYPE, HTML_UTF8_CONTENT_TYPE)
        .header(CONTENT_SECURITY_POLICY, PREVIEW_CSP)
        .header(CONTENT_TYPE_OPTIONS, NO_SNIFF)
        .header(REFERRER_POLICY, NO_REFERRER)
        .body(html.as_bytes().to_vec())
        .unwrap_or_else(|_| tauri::http::Response::new(html.as_bytes().to_vec()))
}

#[cfg(test)]
mod tests;
