const HTML_UTF8_CONTENT_TYPE: &str = "text/html; charset=utf-8";

pub fn preview_response(html: &str) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .header(tauri::http::header::CONTENT_TYPE, HTML_UTF8_CONTENT_TYPE)
        .body(html.as_bytes().to_vec())
        .expect("валидный http::Response")
}

#[cfg(test)]
mod tests;
