// Original Nymora code, MIT. librqbit retains its Apache-2.0 license.
// The process is idle until a trusted parent sends Start after native consent.
use std::{io::Write, net::{Ipv4Addr, SocketAddr}, path::PathBuf};
use librqbit::{Api, Session, SessionOptions, DhtSessionConfig, ListenerOptions, AddTorrent, AddTorrentOptions, AddTorrentResponse};
use base64::Engine;
use librqbit::http_api::{HttpApi, HttpApiOptions};
use librqbit_dualstack_sockets::TcpListener;
use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Deserialize)]
#[serde(tag = "command", rename_all = "lowercase")]
enum Command {
    Start { directory: PathBuf, password: String, local_only: bool, dht_nodes: Vec<String> },
    Stop,
    Resolve { magnet: String, initial_peers: Vec<SocketAddr> },
}

fn emit(value: serde_json::Value) {
    println!("{value}");
    let _ = std::io::stdout().flush();
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Raw upstream diagnostics stay on the private parent pipe. The parent
    // exports only classified causes, never raw tracker URLs or request logs.
    tracing_subscriber::fmt().json().with_writer(std::io::stderr)
        .with_env_filter("warn,librqbit=debug,librqbit_dht=warn")
        .with_ansi(false).init();
    emit(serde_json::json!({"event":"idle", "version":"1.0.2", "engine":"librqbit 9.0.1"}));
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let Some(line) = lines.next_line().await? else { return Ok(()); };
    if line.len() > 32768 { anyhow::bail!("command exceeds safety limit"); }
    let Command::Start { directory, password, local_only, dht_nodes } = serde_json::from_str(&line)? else { return Ok(()); };
    if password.len() < 32 { anyhow::bail!("invalid API credential"); }
    let mut dht = DhtSessionConfig { persistence: None, ..Default::default() };
    if !dht_nodes.is_empty() {
        let mut nodes = vec!["router.bittorrent.com:6881".into(), "router.utorrent.com:6881".into(), "dht.transmissionbt.com:6881".into()];
        nodes.extend(dht_nodes); dht.bootstrap_addrs = Some(nodes);
    }
    let listener_opts = ListenerOptions {
        // librqbit's uTP remains experimental; TCP is its stable default.
        listen_addr: if local_only { (Ipv4Addr::LOCALHOST, 0).into() } else { "[::]:0".parse()? },
        ..Default::default()
    };
    let session = Session::new_with_opts(directory, SessionOptions {
        dht: if local_only { None } else { Some(dht) },
        persistence: None, listen: Some(listener_opts),
        disable_local_service_discovery: local_only, peer_limit: Some(80),
        client_name_and_version: Some("Nymora/1.0.2 (librqbit/9.0.1)".into()),
        ..Default::default()
    }).await?;
    let listener = TcpListener::bind_tcp(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)), Default::default())?;
    let port = listener.bind_addr().port();
    let api = Api::new(session.clone(), None, None);
    let http = HttpApi::new(api, Some(HttpApiOptions { basic_auth: Some(("nymora".into(), password)), ..Default::default() }));
    let task = tokio::spawn(http.make_http_api_and_run(listener, None));
    emit(serde_json::json!({"event":"listening", "port":port}));
    // EOF also closes the session if Electron dies. No detached daemon.
    while let Some(line) = lines.next_line().await? {
        if line.len() > 32768 { break; }
        match serde_json::from_str::<Command>(&line) {
            Ok(Command::Stop) => break,
            Ok(Command::Resolve { magnet, initial_peers }) => {
                let session = session.clone();
                tokio::spawn(async move {
                    match session.add_torrent(AddTorrent::from_url(&magnet), Some(AddTorrentOptions {
                        list_only: true, initial_peers: Some(initial_peers), ..Default::default()
                    })).await {
                        Ok(AddTorrentResponse::ListOnly(result)) => emit(serde_json::json!({
                            "event":"metadata", "bytes":base64::engine::general_purpose::STANDARD.encode(&result.torrent_bytes),
                            "peers":result.seen_peers
                        })),
                        _ => emit(serde_json::json!({"event":"resolve-error"})),
                    }
                });
            },
            _ => break,
        }
    }
    session.stop().await;
    task.abort();
    emit(serde_json::json!({"event":"stopped"}));
    Ok(())
}
