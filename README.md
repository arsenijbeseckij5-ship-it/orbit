# ORBIT

ORBIT is a Windows-first BitTorrent desktop client built with Tauri 2, React, TypeScript, and the `librqbit` engine.

## Download and install

Download the single `ORBIT_*_Full_Project.zip` file from the [latest GitHub release](https://github.com/arsenijbeseckij5-ship-it/orbit/releases/latest) and extract it. It includes the full project source and a ready-to-run `orbit.exe` at the archive root; open the executable to launch ORBIT. The app needs the Microsoft Edge WebView2 Runtime, available from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/), but no Rust, Node.js, or C++ build tools. GitHub's **Code → Download ZIP** is source-only and does not include the executable.

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
- Resize the left sidebar and bottom speed chart by dragging their dividers; dimensions stay within safe limits and are remembered between launches.
- Keep the torrent list, details, and chart in separate layout regions: enlarging the chart compresses the list instead of pushing or covering neighboring content.
- Select all visible torrents, filter the library by incomplete, completed, paused, seeding, or error state, and clear completed entries without deleting downloaded data.
- Pause, resume, and remove torrents. Removing torrent data is a separate, confirmed action.
- Delete torrent files after releasing the engine's file handles, while preserving unrelated files in the download folder.
- Open a torrent's download folder from its right-click menu.
- Persist the engine session between launches; choose, open, copy, or restore the default download folder in Settings. By default, new torrent data is stored in a `Downloads` folder beside the installed app; the previous default is migrated automatically while custom folders are kept.
- Drop `.torrent` files onto the app window.
- Start the frontend in a browser for UI work; torrent controls require the Tauri desktop runtime.

The backend integration test creates a valid torrent locally and exercises real engine add, listing, pause, and resume calls without external peers. It does not claim to verify an end-to-end network transfer.

This is the first working foundation, not a feature-complete BitTorrent client. Session resume uses `librqbit`'s local JSON persistence; the chosen download folder is stored in the WebView's local storage. SQLite has not been integrated. File selection, force recheck, peer and tracker inspection, per-torrent and global limits, categories, tray behavior, and installer signing are not implemented yet. No unsupported engine features are represented as available.

## Windows distribution

The Windows x64 MSI build embeds Microsoft's WebView2 offline installer and installs per machine, which can require administrator approval. The current GitHub release distributes the standalone `orbit.exe` in the full-project ZIP; it needs the Microsoft Edge WebView2 Runtime to be present on the PC. Tauri statically links the Visual C++ runtime for the app, so a separate VC++ Redistributable is not required for this executable. Supported target: Windows 10/11 x64.

The MSI places `orbit.exe` in the selected installation directory (for example, `H:\\Games\\ORBIT`) and creates Start Menu shortcuts separately. The app code and frontend are bundled in that executable; source code and build tools are not runtime files. New torrent payloads go under `<installation directory>\\Downloads`; if Windows does not allow writing there (such as a default `Program Files` install), ORBIT uses the user's `Downloads\\ORBIT` folder instead. Session/settings data remain in the current Windows user profile.

The current MSI and executable are not code-signed; Windows may display an unknown-publisher or SmartScreen warning. A trusted code-signing certificate is needed to remove that warning for public distribution.

Build both the MSI and standalone executable on a Windows build machine with the development prerequisites below:

```powershell
npm ci
npm run tauri build
```

Artifacts are written under `src-tauri\target\release\`: the standalone `orbit.exe` and the MSI under `bundle\msi\`. The MSI is significantly larger because it includes the offline WebView2 installer.

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
