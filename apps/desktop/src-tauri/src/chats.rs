use crate::settings::write_atomic_owner_only;
use std::path::Path;

pub fn load(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

pub fn save(path: &Path, json: &str) -> std::io::Result<()> {
    write_atomic_owner_only(path, json)
}

#[cfg(test)]
mod tests;
