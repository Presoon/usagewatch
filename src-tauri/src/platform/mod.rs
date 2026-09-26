//! Replace only these adapters when implementing another desktop platform.
#[cfg(target_os = "windows")]
#[path = "windows_secrets.rs"]
pub mod secrets;
#[cfg(not(target_os = "windows"))]
#[path = "unsupported_secrets.rs"]
pub mod secrets;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    secure_storage: bool,
    edge_widget: bool,
}

#[tauri::command]
pub fn platform_capabilities() -> Capabilities {
    Capabilities {
        secure_storage: cfg!(target_os = "windows"),
        edge_widget: cfg!(target_os = "windows"),
    }
}

pub fn position_popup(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_positioner::{Position, WindowExt};
        // Reuse the tray anchor when available; opening from the widget or a
        // second launch must also work before the first tray event arrives.
        let anchored = window.move_window_constrained(Position::TrayCenter).is_ok();
        let monitor = if anchored {
            window.current_monitor()
        } else {
            window.primary_monitor()
        };
        if let (Ok(Some(monitor)), Ok(size)) = (monitor, window.outer_size()) {
            let preferred_x = if anchored {
                window.outer_position().ok().map(|p| p.x)
            } else {
                None
            };
            let gap = (12.0 * monitor.scale_factor()).round() as i32;
            let position = popup_position(*monitor.work_area(), size, preferred_x, gap);
            let _ = window.set_position(position);
            return;
        }
    }
    // Safe base behavior until each desktop's menu-bar/tray anchoring is implemented.
    let _ = window.center();
}

#[cfg(any(target_os = "windows", test))]
fn popup_position(
    work: tauri::PhysicalRect<i32, u32>,
    size: tauri::PhysicalSize<u32>,
    preferred_x: Option<i32>,
    gap: i32,
) -> tauri::PhysicalPosition<i32> {
    let left = work.position.x + gap;
    let top = work.position.y + gap;
    let right = (work.position.x + work.size.width as i32 - size.width as i32 - gap).max(left);
    let bottom = (work.position.y + work.size.height as i32 - size.height as i32 - gap).max(top);
    tauri::PhysicalPosition::new(preferred_x.unwrap_or(right).clamp(left, right), bottom)
}

/// Apply the complete rectangle at once: right/bottom anchored content must
/// never be painted at the new size with the previous origin.
pub fn set_widget_bounds(
    window: &tauri::WebviewWindow,
    bounds: tauri::PhysicalRect<i32, u32>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
        };
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        // SAFETY: Tauri owns this live HWND; the rectangle is validated by the caller.
        let result = unsafe {
            SetWindowPos(
                hwnd.0 as _,
                std::ptr::null_mut(),
                bounds.position.x,
                bounds.position.y,
                bounds.size.width as i32,
                bounds.size.height as i32,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
        };
        if result == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        window.set_size(bounds.size).map_err(|e| e.to_string())?;
        window
            .set_position(bounds.position)
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn popup_stays_above_taskbar_with_or_without_tray_anchor() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let gap = (12.0_f64 * scale).round() as i32;
            let size = tauri::LogicalSize::new(760.0, 560.0).to_physical::<u32>(scale);
            for origin in [(0, 0), (-2560, -1440)] {
                let work = tauri::PhysicalRect {
                    position: origin.into(),
                    size: (2560, 1392).into(),
                };
                for anchor in [
                    None,
                    Some(origin.0 + 500),
                    Some(origin.0 - 100),
                    Some(origin.0 + 2500),
                ] {
                    let position = popup_position(work, size, anchor, gap);
                    assert_eq!(position.y + size.height as i32, origin.1 + 1392 - gap);
                    assert!(position.x >= origin.0 + gap);
                    assert!(position.x + size.width as i32 <= origin.0 + 2560 - gap);
                    if anchor.is_none() {
                        assert_eq!(position.x + size.width as i32, origin.0 + 2560 - gap);
                    }
                }
            }
        }
    }
}
