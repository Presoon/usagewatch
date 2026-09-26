use std::{
    io::{Read, Write},
    net::TcpStream,
    time::Duration,
};
use url::Url;

fn response(stream: &mut TcpStream, status: &str, title: &str, copy: &str) {
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>{title}</title><style>body{{margin:0;background:#18181a;color:#f5f5f7;font:16px system-ui;display:grid;place-items:center;min-height:100vh}}main{{max-width:420px;padding:32px;text-align:center}}h1{{font-size:22px}}p{{color:#c7c7cc;line-height:1.5}}</style></head><body><main><h1>{title}</h1><p>{copy}</p></main></body></html>"
    );
    let message = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(message.as_bytes());
    let _ = stream.flush();
}

pub(super) fn parse_callback(
    stream: &mut TcpStream,
    callback_path: &str,
    expected_state: &str,
) -> Option<Result<String, String>> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut buffer = [0_u8; 16 * 1024];
    let size = match stream.read(&mut buffer) {
        Ok(size) if size > 0 => size,
        _ => return None,
    };
    let request = String::from_utf8_lossy(&buffer[..size]);
    let Some(target) = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
    else {
        response(
            stream,
            "400 Bad Request",
            "Sign-in failed",
            "Invalid callback request.",
        );
        return None;
    };
    let Ok(url) = Url::parse(&format!("http://127.0.0.1{target}")) else {
        response(
            stream,
            "400 Bad Request",
            "Sign-in failed",
            "Invalid callback URL.",
        );
        return None;
    };
    if url.path() != callback_path {
        response(
            stream,
            "404 Not Found",
            "Not found",
            "This is not the UsageWatch sign-in callback.",
        );
        return None;
    }

    let mut code = None;
    let mut state = None;
    let mut error = None;
    let mut description = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            "error" => error = Some(value.into_owned()),
            "error_description" => description = Some(value.into_owned()),
            _ => {}
        }
    }

    if let Some(error) = error {
        let detail = description.unwrap_or(error);
        response(
            stream,
            "400 Bad Request",
            "Sign-in cancelled",
            "Return to UsageWatch and try again.",
        );
        return Some(Err(format!("OAuth authorization failed: {detail}")));
    }
    if state.as_deref() != Some(expected_state) {
        response(
            stream,
            "400 Bad Request",
            "Sign-in failed",
            "The OAuth state did not match. Return to UsageWatch and retry.",
        );
        return Some(Err("OAuth state mismatch".into()));
    }
    let Some(code) = code.filter(|value| !value.is_empty()) else {
        response(
            stream,
            "400 Bad Request",
            "Sign-in failed",
            "The callback did not contain an authorization code.",
        );
        return Some(Err("OAuth callback did not contain a code".into()));
    };

    response(
        stream,
        "200 OK",
        "Signed in",
        "You can close this tab and return to UsageWatch.",
    );
    Some(Ok(code))
}

#[cfg(test)]
mod tests {
    use super::parse_callback;
    use std::{io::Write, net::TcpListener, thread};

    #[test]
    fn accepts_matching_callback_and_decodes_code() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let client = thread::spawn(move || {
            let mut stream = std::net::TcpStream::connect(address).unwrap();
            stream
                .write_all(b"GET /auth/callback?code=a%2Fb&state=right HTTP/1.1\r\nHost: localhost\r\n\r\n")
                .unwrap();
        });
        let (mut stream, _) = listener.accept().unwrap();
        let result = parse_callback(&mut stream, "/auth/callback", "right").unwrap();
        assert_eq!(result.unwrap(), "a/b");
        client.join().unwrap();
    }

    #[test]
    fn rejects_state_mismatch() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let client = thread::spawn(move || {
            let mut stream = std::net::TcpStream::connect(address).unwrap();
            stream
                .write_all(
                    b"GET /auth/callback?code=abc&state=wrong HTTP/1.1\r\nHost: localhost\r\n\r\n",
                )
                .unwrap();
        });
        let (mut stream, _) = listener.accept().unwrap();
        let result = parse_callback(&mut stream, "/auth/callback", "right").unwrap();
        assert!(result.unwrap_err().contains("state mismatch"));
        client.join().unwrap();
    }
}
