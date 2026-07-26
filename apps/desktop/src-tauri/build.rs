const REGION_CAPTURE_SOURCE: &str = "native/region_capture.c";

fn main() {
    println!("cargo:rerun-if-changed={REGION_CAPTURE_SOURCE}");
    cc::Build::new().file(REGION_CAPTURE_SOURCE).compile("region_capture");
    for framework in ["AppKit", "CoreGraphics", "ImageIO", "CoreFoundation"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
    println!("cargo:rustc-link-lib=objc");
    tauri_build::build()
}
