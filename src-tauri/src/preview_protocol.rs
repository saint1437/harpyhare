//! Ответ кастомной схемы preview:// — текущий HTML превью как text/html.

/// HTTP-ответ для запроса к preview://: тело — переданный HTML, тип — text/html.
pub fn preview_response(html: &str) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .header(
            tauri::http::header::CONTENT_TYPE,
            "text/html; charset=utf-8",
        )
        .body(html.as_bytes().to_vec())
        .expect("валидный http::Response")
}

#[cfg(test)]
mod tests {
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
}
