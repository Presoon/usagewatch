use tauri::{
    AppHandle, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalRect, PhysicalSize,
};

pub const MAIN_WINDOW: &str = "main";
pub const WIDGET_WINDOW: &str = "widget";

/// Current widget placement mirrored from the webviews.
#[derive(Default)]
pub struct WidgetState(std::sync::Mutex<WidgetConfig>);

#[derive(Clone)]
pub struct WidgetConfig {
    pub enabled: bool,
    /// "left" | "right" | "top" | "bottom".
    pub edge: String,
    /// Position along that edge, 0..1 of the usable work area.
    pub pos_percent: f64,
    /// Monitor name the widget is docked to; None = primary.
    pub monitor: Option<String>,
}

impl Default for WidgetConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            edge: "right".into(),
            pos_percent: 0.5,
            monitor: None,
        }
    }
}

/// Where the widget ended up after a drag, echoed back to the webview.
#[derive(Clone, serde::Serialize)]
pub struct WidgetPlacement {
    pub edge: String,
    #[serde(rename = "posPercent")]
    pub pos_percent: f64,
    pub monitor: Option<String>,
}

impl WidgetState {
    pub fn get(&self) -> WidgetConfig {
        self.0.lock().map(|c| c.clone()).unwrap_or_default()
    }

    pub fn set(&self, config: WidgetConfig) {
        if let Ok(mut current) = self.0.lock() {
            *current = config;
        }
    }
}

fn monitor_named(app: &AppHandle, name: Option<&str>) -> Option<Monitor> {
    if let Some(name) = name {
        if let Ok(monitors) = app.available_monitors() {
            let found = monitors
                .into_iter()
                .find(|m| m.name().map(String::as_str) == Some(name));
            if found.is_some() {
                return found;
            }
        }
    }
    app.primary_monitor().ok().flatten()
}

/// Place the widget flush against `edge` of its monitor, `pos_percent` along it.
fn dock(app: &AppHandle, config: &WidgetConfig) {
    let Some(window) = app.get_webview_window(WIDGET_WINDOW) else {
        return;
    };
    let Some(monitor) = monitor_named(app, config.monitor.as_deref()) else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let position = dock_position(
        config,
        PhysicalRect {
            position: *monitor.position(),
            size: *monitor.size(),
        },
        *monitor.work_area(),
        size,
    );
    let _ = window.set_position(position);
}

fn dock_position(
    config: &WidgetConfig,
    full: PhysicalRect<i32, u32>,
    work: PhysicalRect<i32, u32>,
    size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let (w, h) = (size.width as i32, size.height as i32);
    let p = config.pos_percent.clamp(0.0, 1.0);

    // Flush against the physical screen edge; the free axis stays inside the
    // work area so the widget never slides under the taskbar.
    let along_x = work.position.x + ((work.size.width as i32 - w).max(0) as f64 * p).round() as i32;
    let along_y =
        work.position.y + ((work.size.height as i32 - h).max(0) as f64 * p).round() as i32;

    match config.edge.as_str() {
        "left" => PhysicalPosition::new(full.position.x, along_y),
        "top" => PhysicalPosition::new(along_x, full.position.y),
        "bottom" => PhysicalPosition::new(along_x, full.position.y + full.size.height as i32 - h),
        _ => PhysicalPosition::new(full.position.x + full.size.width as i32 - w, along_y),
    }
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        crate::platform::position_popup(&window);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_main_window(app);
        }
    }
}

pub fn sync_widget_window(app: &AppHandle, config: WidgetConfig) {
    let Some(widget) = app.get_webview_window(WIDGET_WINDOW) else {
        return;
    };
    if config.enabled {
        dock(app, &config);
        let _ = widget.show();
    } else {
        let _ = widget.hide();
        let _ = crate::widget_tip::widget_tip_hide(app.clone(), app.state(), true);
    }
}

/// Compute from the requested size, then resize and move atomically.
pub fn resize_widget_window(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    if !width.is_finite()
        || !height.is_finite()
        || !(1.0..=10_000.0).contains(&width)
        || !(1.0..=10_000.0).contains(&height)
    {
        return Err("Invalid widget size".into());
    }
    let widget = app
        .get_webview_window(WIDGET_WINDOW)
        .ok_or("Widget window unavailable")?;
    let config = app
        .try_state::<WidgetState>()
        .map(|s| s.get())
        .unwrap_or_default();
    let monitor =
        monitor_named(app, config.monitor.as_deref()).ok_or("Widget monitor unavailable")?;
    let size = LogicalSize::new(width, height).to_physical::<u32>(monitor.scale_factor());
    let position = dock_position(
        &config,
        PhysicalRect {
            position: *monitor.position(),
            size: *monitor.size(),
        },
        *monitor.work_area(),
        size,
    );
    crate::platform::set_widget_bounds(&widget, PhysicalRect { position, size })
}

fn placement_of(config: &WidgetConfig) -> WidgetPlacement {
    WidgetPlacement {
        edge: config.edge.clone(),
        pos_percent: config.pos_percent,
        monitor: config.monitor.clone(),
    }
}

/// Snap the widget to the edge nearest the cursor, on whichever monitor the
/// cursor is over. Returns the new placement so the webview can store it.
pub fn drag_widget_window(app: &AppHandle) -> WidgetPlacement {
    let _ = crate::widget_tip::widget_tip_hide(app.clone(), app.state(), true);
    let mut config = app
        .try_state::<WidgetState>()
        .map(|s| s.get())
        .unwrap_or_default();
    let Ok(cursor) = app.cursor_position() else {
        return placement_of(&config);
    };
    let monitor = app
        .monitor_from_point(cursor.x, cursor.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return placement_of(&config);
    };
    let Some(window) = app.get_webview_window(WIDGET_WINDOW) else {
        return placement_of(&config);
    };
    let Ok(size) = window.outer_size() else {
        return placement_of(&config);
    };

    let work = monitor.work_area();
    let left = work.position.x as f64;
    let top = work.position.y as f64;
    let right = left + work.size.width as f64;
    let bottom = top + work.size.height as f64;

    // Nearest edge wins.
    let distances = [
        ("left", cursor.x - left),
        ("right", right - cursor.x),
        ("top", cursor.y - top),
        ("bottom", bottom - cursor.y),
    ];
    let edge = distances
        .iter()
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(name, _)| *name)
        .unwrap_or("right");

    // The widget centres on the cursor along the edge it is docked to.
    config.pos_percent = if edge == "top" || edge == "bottom" {
        let usable = (work.size.width as i32 - size.width as i32).max(1) as f64;
        ((cursor.x - left - size.width as f64 / 2.0) / usable).clamp(0.0, 1.0)
    } else {
        let usable = (work.size.height as i32 - size.height as i32).max(1) as f64;
        ((cursor.y - top - size.height as f64 / 2.0) / usable).clamp(0.0, 1.0)
    };
    config.edge = edge.to_string();
    config.monitor = monitor.name().cloned();

    dock(app, &config);
    if let Some(state) = app.try_state::<WidgetState>() {
        state.set(config.clone());
    }
    placement_of(&config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resize_keeps_each_screen_edge_fixed_at_multiple_dpi_scales() {
        // A secondary monitor to the left and above the primary, with a taskbar.
        let screen = PhysicalRect {
            position: (-2560, -200).into(),
            size: (2560, 1440).into(),
        };
        let work = PhysicalRect {
            position: screen.position,
            size: (2560, 1392).into(),
        };
        for scale in [1.0, 1.25, 1.5, 2.0] {
            for edge in ["left", "right", "top", "bottom"] {
                let config = WidgetConfig {
                    edge: edge.into(),
                    ..Default::default()
                };
                let vertical = edge == "left" || edge == "right";
                let size = |expanded| {
                    if vertical {
                        LogicalSize::new(if expanded { 358.0 } else { 62.0 }, 436.0)
                            .to_physical::<u32>(scale)
                    } else {
                        LogicalSize::new(424.0, if expanded { 330.0 } else { 108.0 })
                            .to_physical::<u32>(scale)
                    }
                };
                let before_size = size(false);
                let after_size = size(true);
                let before = dock_position(&config, screen, work, before_size);
                let after = dock_position(&config, screen, work, after_size);
                match edge {
                    "right" => assert_eq!(
                        before.x + before_size.width as i32,
                        after.x + after_size.width as i32
                    ),
                    "bottom" => assert_eq!(
                        before.y + before_size.height as i32,
                        after.y + after_size.height as i32
                    ),
                    "left" => assert_eq!(before.x, after.x),
                    _ => assert_eq!(before.y, after.y),
                }
                if vertical {
                    assert_eq!(before.y, after.y);
                } else {
                    assert_eq!(before.x, after.x);
                }
                assert_eq!(dock_position(&config, screen, work, size(false)), before);
            }
        }
    }
}
