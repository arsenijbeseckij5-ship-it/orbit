# ORBIT

ORBIT is a Windows-first BitTorrent desktop client built with Tauri 2, React, TypeScript, and the `librqbit` engine.

## Architecture

| Approach | Trade-off |
|---|---|
| Electron with a separate torrent service | Mature web stack, but adds a heavier runtime and another process. |
| Web UI attached to a remote torrent daemon | Lightweight UI, but depends on a separately installed service and exposes a network API. |
| Tauri 2 with an embedded Rust engine | Native desktop shell and a local engine in one app; selected for the Windows-first, offline-by-default product. |

```text
src/
  components/  Sidebar, toolbar, torrent table, live speed chart, add dialog
  pages/       Download settings
  services/    Typed Tauri command client
  types/       Torrent snapshots
src-tauri/
  src/         Tauri setup and torrent commands
  permissions/ Explicit command ACL
```

## Current foundation

- Add Magnet links and local `.torrent` files to a real `librqbit` session.
- View engine-reported progress, transfer rates, ETA, completion, and errors.
- Plot live aggregate download and upload rates at the bottom of the window (green for downloads, blue for uploads).
- Pause, resume, and remove torrents. Removing torrent data is a separate, confirmed action.
- Open a torrent's download folder from its right-click menu.
- Persist the engine session between launches and choose a download folder.
- Drop `.torrent` files onto the app window.
- Start the frontend in a browser for UI work; torrent controls require the Tauri desktop runtime.

The backend integration test creates a valid torrent locally and exercises real engine add, listing, pause, and resume calls without external peers. It does not claim to verify an end-to-end network transfer.

This is the first working foundation, not a feature-complete BitTorrent client. Session resume uses `librqbit`'s local JSON persistence; the chosen download folder is stored in the WebView's local storage. SQLite has not been integrated. File selection, force recheck, peer and tracker inspection, per-torrent and global limits, categories, tray behavior, and installer signing are not implemented yet. No unsupported engine features are represented as available.

## Development

Install Node.js, Rust (stable, edition 2024), and the Windows C++ Build Tools with the MSVC workload and Windows SDK. Then run:

```powershell
npm install
npm run tauri dev
```

Create a Windows installer with:

```powershell
npm run tauri build
```

Run the backend unit tests with:

```powershell
cargo test --manifest-path .\src-tauri\Cargo.toml
```

The default download folder is `Downloads\ORBIT`. No account or telemetry service is used.
