mod oauth_loopback;
mod platform;
mod secrets;
mod ticker;
mod tray;
mod widget_tip;
mod window;

use tauri::WindowEvent;
use tauri_plugin_autostart::MacosLauncher;

use crate::window::{
    drag_widget_window, resize_widget_window, sync_widget_window, WidgetConfig, WidgetPlacement,
    WidgetState, MAIN_WINDOW,
};

#[tauri::command]
fn set_widget_state(
    app: tauri::AppHandle,
    state: tauri::State<'_, WidgetState>,
    enabled: bool,
    edge: String,
    pos_percent: f64,
    monitor: Option<String>,
) -> Result<(), String> {
    if enabled && !cfg!(target_os = "windows") {
        return Err("Edge widget is not implemented on this platform".into());
    }
    if !["left", "right", "top", "bottom"].contains(&edge.as_str())
        || !pos_percent.is_finite()
        || !(0.0..=1.0).contains(&pos_percent)
    {
        return Err("Invalid widget placement".into());
    }
    let config = WidgetConfig {
        enabled,
        edge,
        pos_percent,
        monitor,
    };
    state.inner().set(config.clone());
    sync_widget_window(&app, config);
    Ok(())
}

#[tauri::command]
fn resize_widget(app: tauri::AppHandle, width: f64, height: f64) -> Result<(), String> {
    resize_widget_window(&app, width, height)
}

/// Drag: snap to the edge nearest the cursor, on the monitor under it.
#[tauri::command]
fn move_widget(app: tauri::AppHandle) -> Result<WidgetPlacement, String> {
    Ok(drag_widget_window(&app))
}

#[tauri::command]
fn position_popup(window: tauri::WebviewWindow) {
    platform::position_popup(&window);
}

#[tauri::command]
fn show_main(app: tauri::AppHandle) {
    window::show_main_window(&app);
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // single-instance must be the FIRST plugin registered. A second launch
    // hands its args to this callback instead of starting a new process; we
    // just surface the existing window.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main_window(app);
        }));
    }

    builder
        .manage(oauth_loopback::OAuthLoopbackState::default())
        .manage(window::WidgetState::default())
        .manage(widget_tip::WidgetTipState::default())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            // No extra CLI args needed when the OS autostarts us.
            Some(vec![]),
        ))
        .invoke_handler(tauri::generate_handler![
            oauth_loopback::oauth_loopback_start,
            oauth_loopback::oauth_loopback_wait,
            oauth_loopback::oauth_loopback_cancel,
            secrets::secure_set,
            secrets::secure_get,
            secrets::secure_delete,
            platform::platform_capabilities,
            position_popup,
            show_main,
            quit_app,
            set_widget_state,
            resize_widget,
            move_widget,
            widget_tip::widget_tip_get,
            widget_tip::widget_tip_set,
            widget_tip::widget_tip_show,
            widget_tip::widget_tip_hide,
        ])
        .setup(|app| {
            tray::setup_tray(app)?;
            // Native 30 s poll tick; the webview decides what's due.
            ticker::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the dashboard keeps background refresh and the widget alive.
            if window.label() == MAIN_WINDOW {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running UsageWatch");
}
