use super::*;

#[test]
fn body_is_html_bytes() {
    let r = preview_response("<p>привет</p>");
    assert_eq!(r.body().as_slice(), "<p>привет</p>".as_bytes());
}

#[test]
fn content_type_is_text_html() {
    let r = preview_response("<p>x</p>");
    assert_eq!(
        r.headers().get(tauri::http::header::CONTENT_TYPE).unwrap(),
        "text/html; charset=utf-8"
    );
}

#[test]
fn empty_html_gives_empty_body() {
    let r = preview_response("");
    assert!(r.body().is_empty());
}

#[test]
fn the_response_carries_a_content_security_policy() {
    let resp = preview_response("<h1>привет</h1>");
    let csp = resp
        .headers()
        .get(CONTENT_SECURITY_POLICY)
        .expect("CSP обязателен: содержимое пишет модель")
        .to_str()
        .unwrap();
    // The page may render itself freely…
    assert!(csp.contains("script-src 'self' 'unsafe-inline'"));
    // …but must not reach the IPC origin or nest anything.
    assert!(csp.contains("connect-src https:"));
    assert!(!csp.contains("ipc:"));
    assert!(csp.contains("frame-ancestors 'none'"));
    assert!(csp.contains("form-action 'none'"));
    assert!(csp.contains("object-src 'none'"));
}

#[test]
fn the_response_refuses_mime_sniffing_and_leaks_no_referrer() {
    let resp = preview_response("<p>x</p>");
    assert_eq!(resp.headers().get(CONTENT_TYPE_OPTIONS).unwrap(), NO_SNIFF);
    assert_eq!(resp.headers().get(REFERRER_POLICY).unwrap(), NO_REFERRER);
}
