//! Native 30 s tick. Emitting from a native thread (not a webview `setInterval`)
//! keeps the cadence reliable even when the hidden WebView2 is throttled.
//! The webview decides on each tick whether a provider is due.

use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

pub const POLL_TICK_EVENT: &str = "poll-tick";
const TICK_INTERVAL_SECS: u64 = 30;

pub fn start(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(TICK_INTERVAL_SECS));
        // If the webview is gone the app is shutting down; ignore send errors.
        let _ = app.emit(POLL_TICK_EVENT, ());
    });
}
