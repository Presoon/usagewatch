use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Emitter,
};

use crate::window::{show_main_window, toggle_main_window, MAIN_WINDOW};

/// Build the tray icon with a right-click context menu.
///
/// Left click toggles the popup; right click opens the menu.
pub fn setup_tray(app: &App) -> tauri::Result<()> {
    let refresh_i = MenuItem::with_id(app, "refresh", "Refresh now", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let about_i = MenuItem::with_id(app, "about", "About", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&refresh_i, &settings_i, &about_i, &quit_i])?;

    TrayIconBuilder::with_id("usagewatch-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("UsageWatch")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            action @ ("refresh" | "settings" | "about") => {
                let _ = app.emit_to(MAIN_WINDOW, "menu-action", action);
                show_main_window(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Cache the tray icon rect so the positioner can anchor the popup.
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
