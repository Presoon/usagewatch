use std::{
    collections::HashMap,
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use tauri::State;
mod callback;
use callback::parse_callback;

const LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

struct LoopbackSession {
    port: u16,
    expires_at: Instant,
    cancel: Arc<AtomicBool>,
    receiver: Mutex<Option<Receiver<Result<String, String>>>>,
}

#[derive(Default)]
pub struct OAuthLoopbackState {
    sessions: Mutex<HashMap<String, Arc<LoopbackSession>>>,
}

fn stop_session(session: &LoopbackSession) {
    session.cancel.store(true, Ordering::Relaxed);
    let _ = TcpStream::connect(("127.0.0.1", session.port));
}

#[tauri::command]
pub fn oauth_loopback_start(
    session_id: String,
    port: u16,
    callback_path: String,
    expected_state: String,
    state: State<'_, OAuthLoopbackState>,
) -> Result<u16, String> {
    if !callback_path.starts_with('/') || expected_state.is_empty() {
        return Err("Invalid OAuth loopback configuration".into());
    }

    if session_id.is_empty() || session_id.len() > 80 {
        return Err("Invalid OAuth session ID".into());
    }
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "OAuth state lock failed")?;
    if sessions.contains_key(&session_id) {
        return Err("OAuth session already exists".into());
    }
    // Keep completed results available until the owner calls wait.
    sessions.retain(|_, session| session.expires_at > Instant::now());
    if sessions.len() >= 16 {
        return Err("Too many pending sign-ins".into());
    }

    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|error| {
        if port == 0 {
            format!("Could not allocate a local OAuth callback port ({error}).")
        } else {
            format!(
                "Port {port} is already in use. Close any other Codex sign-in and retry ({error})."
            )
        }
    })?;
    let actual_port = listener
        .local_addr()
        .map_err(|error| format!("Could not read OAuth callback address: {error}"))?
        .port();
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Could not configure OAuth callback: {error}"))?;

    let (sender, receiver) = mpsc::channel();
    let cancel = Arc::new(AtomicBool::new(false));
    let thread_cancel = cancel.clone();
    std::thread::spawn(move || {
        let deadline = Instant::now() + LOGIN_TIMEOUT;
        loop {
            if thread_cancel.load(Ordering::Relaxed) {
                return;
            }
            if Instant::now() >= deadline {
                let _ = sender.send(Err("Sign-in timed out. Start sign-in again.".into()));
                return;
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    if let Some(result) =
                        parse_callback(&mut stream, &callback_path, &expected_state)
                    {
                        let _ = sender.send(result);
                        return;
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(error) => {
                    let _ = sender.send(Err(format!("OAuth callback failed: {error}")));
                    return;
                }
            }
        }
    });

    sessions.insert(
        session_id,
        Arc::new(LoopbackSession {
            port: actual_port,
            expires_at: Instant::now() + LOGIN_TIMEOUT + Duration::from_secs(2),
            cancel,
            receiver: Mutex::new(Some(receiver)),
        }),
    );
    Ok(actual_port)
}

#[tauri::command]
pub async fn oauth_loopback_wait(
    session_id: String,
    state: State<'_, OAuthLoopbackState>,
) -> Result<String, String> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| "OAuth state lock failed")?
        .get(&session_id)
        .cloned()
        .ok_or("No sign-in is in progress")?;
    let receiver = session
        .receiver
        .lock()
        .map_err(|_| "OAuth receiver lock failed")?
        .take()
        .ok_or("Sign-in is already being awaited")?;

    let result = tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv_timeout(LOGIN_TIMEOUT + Duration::from_secs(2))
            .map_err(|_| "Sign-in timed out. Start sign-in again.".to_string())?
    })
    .await
    .map_err(|error| format!("OAuth callback task failed: {error}"))?;

    let mut current = state
        .sessions
        .lock()
        .map_err(|_| "OAuth state lock failed")?;
    if current
        .get(&session_id)
        .is_some_and(|value| Arc::ptr_eq(value, &session))
    {
        current.remove(&session_id);
    }
    result
}

#[tauri::command]
pub fn oauth_loopback_cancel(
    session_id: String,
    state: State<'_, OAuthLoopbackState>,
) -> Result<(), String> {
    if let Some(session) = state
        .sessions
        .lock()
        .map_err(|_| "OAuth state lock failed")?
        .remove(&session_id)
    {
        stop_session(&session);
    }
    Ok(())
}
