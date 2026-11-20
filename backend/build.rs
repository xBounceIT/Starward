use std::env;
use std::path::Path;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-env-changed=APP_VERSION");

    if Path::new("../.git/HEAD").exists() {
        println!("cargo:rerun-if-changed=../.git/HEAD");
    }
    if Path::new("../.git/refs/tags").exists() {
        println!("cargo:rerun-if-changed=../.git/refs/tags");
    }

    let version = env::var("APP_VERSION")
        .ok()
        .map(|v| v.trim().trim_start_matches('v').to_string())
        .filter(|v| !v.is_empty())
        .or_else(git_tag_version)
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());

    println!("cargo:rustc-env=STARWARD_APP_VERSION={version}");
}

fn git_tag_version() -> Option<String> {
    let output = Command::new("git")
        .args(["describe", "--tags", "--match", "v*.*.*"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let raw = String::from_utf8(output.stdout).ok()?;
    let trimmed = raw.trim().trim_start_matches('v');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
