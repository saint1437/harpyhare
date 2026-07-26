const REGION_CAPTURE_SOURCE: &str = "native/region_capture.c";
const REGION_CAPTURE_LIB: &str = "region_capture";
const APPLE_FRAMEWORKS: [&str; 4] = ["AppKit", "CoreGraphics", "ImageIO", "CoreFoundation"];
const OBJC_RUNTIME_LIB: &str = "objc";
const TARGET_OS_ENV: &str = "CARGO_CFG_TARGET_OS";
const MACOS: &str = "macos";

fn build_region_capture_overlay() {
    println!("cargo:rerun-if-changed={REGION_CAPTURE_SOURCE}");
    cc::Build::new()
        .file(REGION_CAPTURE_SOURCE)
        .compile(REGION_CAPTURE_LIB);
    for framework in APPLE_FRAMEWORKS {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
    println!("cargo:rustc-link-lib={OBJC_RUNTIME_LIB}");
}

fn main() {
    if std::env::var(TARGET_OS_ENV).as_deref() == Ok(MACOS) {
        build_region_capture_overlay();
    }
    tauri_build::build()
}
