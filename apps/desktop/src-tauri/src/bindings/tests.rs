use super::*;
use specta_typescript::Typescript;

#[test]
fn typescript_bindings_are_up_to_date() {
    builder()
        .export(Typescript::default(), BINDINGS_OUTPUT_PATH)
        .expect("экспорт TS-биндингов");
}
