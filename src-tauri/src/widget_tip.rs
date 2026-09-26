use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalRect, PhysicalSize, State,
};

const TIP: &str = "widget-tip";

#[derive(Clone, serde::Serialize)]
pub struct Content {
    view: serde_json::Value,
    center: f64,
    theme: String,
}

#[derive(Clone, Default, serde::Serialize)]
pub struct TipState {
    revision: u64,
    content: Option<Content>,
}

#[derive(Default)]
pub struct WidgetTipState(Mutex<TipState>);

#[tauri::command]
pub fn widget_tip_get(state: State<'_, WidgetTipState>) -> Result<TipState, String> {
    state.0.lock().map(|s| s.clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn widget_tip_set(
    app: AppHandle,
    state: State<'_, WidgetTipState>,
    view: serde_json::Value,
    center: f64,
    theme: String,
) -> Result<(), String> {
    if !view.is_object()
        || !center.is_finite()
        || !(0.0..=10_000.0).contains(&center)
        || !matches!(theme.as_str(), "light" | "gray" | "dark")
    {
        return Err("Invalid widget preview".into());
    }
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    current.revision += 1;
    current.content = Some(Content {
        view,
        center,
        theme,
    });
    app.emit_to(TIP, "widget-tip-content", current.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn widget_tip_hide(
    app: AppHandle,
    state: State<'_, WidgetTipState>,
    force: bool,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(TIP) else {
        return Ok(());
    };
    // Moving from the strip into its preview keeps long lists scrollable.
    if !force && window.is_visible().unwrap_or(false) {
        if let (Ok(cursor), Ok(position), Ok(size)) = (
            app.cursor_position(),
            window.outer_position(),
            window.outer_size(),
        ) {
            if cursor.x >= position.x as f64
                && cursor.x < position.x as f64 + size.width as f64
                && cursor.y >= position.y as f64
                && cursor.y < position.y as f64 + size.height as f64
            {
                return Ok(());
            }
        }
    }
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    current.revision += 1;
    current.content = None;
    window.hide().map_err(|e| e.to_string())?;
    app.emit_to(TIP, "widget-tip-content", current.clone())
        .map_err(|e| e.to_string())
}

fn tip_position(
    edge: &str,
    widget: PhysicalRect<i32, u32>,
    work: PhysicalRect<i32, u32>,
    size: PhysicalSize<u32>,
    center: i32,
    gap: i32,
) -> PhysicalPosition<i32> {
    let (x, y) = match edge {
        "left" => (
            widget.position.x + widget.size.width as i32 + gap,
            widget.position.y + center - size.height as i32 / 2,
        ),
        "top" => (
            widget.position.x + center - size.width as i32 / 2,
            widget.position.y + widget.size.height as i32 + gap,
        ),
        "bottom" => (
            widget.position.x + center - size.width as i32 / 2,
            widget.position.y - size.height as i32 - gap,
        ),
        _ => (
            widget.position.x - size.width as i32 - gap,
            widget.position.y + center - size.height as i32 / 2,
        ),
    };
    PhysicalPosition::new(
        x.clamp(
            work.position.x,
            work.position.x + work.size.width.saturating_sub(size.width) as i32,
        ),
        y.clamp(
            work.position.y,
            work.position.y + work.size.height.saturating_sub(size.height) as i32,
        ),
    )
}

#[tauri::command]
pub fn widget_tip_show(
    app: AppHandle,
    state: State<'_, WidgetTipState>,
    revision: u64,
    height: f64,
) -> Result<(), String> {
    if !height.is_finite() || !(1.0..=600.0).contains(&height) {
        return Err("Invalid preview height".into());
    }
    let current = state.0.lock().map_err(|e| e.to_string())?;
    // A late renderer measurement must not reopen an already dismissed preview.
    if current.revision != revision {
        return Ok(());
    }
    let Some(content) = &current.content else {
        return Ok(());
    };
    let config = app.state::<crate::window::WidgetState>().get();
    if !config.enabled {
        return Ok(());
    }
    let widget = app
        .get_webview_window(crate::window::WIDGET_WINDOW)
        .ok_or("Widget unavailable")?;
    let tip = app.get_webview_window(TIP).ok_or("Preview unavailable")?;
    let monitor = widget
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("Monitor unavailable")?;
    let scale = monitor.scale_factor();
    let work = *monitor.work_area();
    let desired = LogicalSize::new(280.0, height.ceil()).to_physical::<u32>(scale);
    let size = PhysicalSize::new(
        desired.width.min(work.size.width),
        desired.height.min(work.size.height),
    );
    let widget_bounds = PhysicalRect {
        position: widget.outer_position().map_err(|e| e.to_string())?,
        size: widget.outer_size().map_err(|e| e.to_string())?,
    };
    let position = tip_position(
        &config.edge,
        widget_bounds,
        work,
        size,
        (content.center * scale).round() as i32,
        (10.0 * scale).round() as i32,
    );
    crate::platform::set_widget_bounds(&tip, PhysicalRect { position, size })?;
    tip.show().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_fits_all_edges_without_changing_widget_bounds() {
        let work = PhysicalRect {
            position: (-1920, -100).into(),
            size: (1920, 1040).into(),
        };
        let size = PhysicalSize::new(280, 400);
        for (edge, position, dimensions) in [
            ("right", (-62, 300), (62, 436)),
            ("left", (-1920, 300), (62, 436)),
            ("bottom", (-1000, 832), (424, 108)),
            ("top", (-1000, -100), (424, 108)),
        ] {
            let widget = PhysicalRect {
                position: position.into(),
                size: dimensions.into(),
            };
            for center in [32, 106, 180, 254, 328] {
                let p = tip_position(edge, widget, work, size, center, 10);
                assert!(p.x >= work.position.x && p.y >= work.position.y);
                assert!(p.x + size.width as i32 <= 0 && p.y + size.height as i32 <= 940);
                match edge {
                    "right" => assert_eq!(p.x + size.width as i32 + 10, widget.position.x),
                    "left" => assert_eq!(p.x, widget.position.x + widget.size.width as i32 + 10),
                    "bottom" => assert_eq!(p.y + size.height as i32 + 10, widget.position.y),
                    _ => assert_eq!(p.y, widget.position.y + widget.size.height as i32 + 10),
                }
            }
        }
    }
}
