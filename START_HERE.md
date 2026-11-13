# AnimForge Studio — Quick Start Guide

**Repository Path:** `/Users/vipinkumar/Desktop/animator /AnimForgeLab`  
*(Preserve the trailing space in `animator ` when typing commands manually.)*

---

## 1. One-Click Launch (macOS)

1. Double-click **`Start-AnimForge.command`** in Finder.  
   *(If macOS shows an "unidentified developer" prompt the first time, right-click `Start-AnimForge.command` → **Open** → **Open**.)*
2. Terminal will open, verify toolchains (`node`, `npm`, `rustc`, `cargo`, `ffmpeg`, Chrome) and installed dependencies, prevent duplicate instances, and launch the **native AnimForge Studio Tauri desktop window**.
3. Wait a few seconds for Vite (`http://localhost:1420`) + Rust to initialize the native window.

## 2. How to Stop Cleanly

Choose any of the following — all shut down the desktop shell, Vite dev server, `PreviewServer`, and `worker.js` cleanly:

- Quit the **AnimForge Studio** window normally (**`Cmd + Q`** or close button).
- Press **`Ctrl + C`** in the Terminal window opened by `Start-AnimForge.command`.
- Double-click **`STOP-ANIMFORGE.command`** in Finder (or run `./STOP-ANIMFORGE.command` in Terminal).

## 3. Manual Terminal Commands

### Development Mode (used by `Start-AnimForge.command`)
```bash
cd "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop"
npm run tauri dev
```

### Production Build & Launch
```bash
cd "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop"
npm run tauri build
"/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop/src-tauri/target/release/animforge-desktop"
```

## 4. Troubleshooting (Manual Setup — No Auto-Install)

`Start-AnimForge.command` never modifies files or auto-installs packages. If it reports a missing prerequisite, run the matching manual command:

- **Core dependencies / worker missing:**
  ```bash
  cd "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-core"
  npm install && npm run build
  ```
- **Desktop dependencies missing:**
  ```bash
  cd "/Users/vipinkumar/Desktop/animator /AnimForgeLab/animforge-desktop"
  npm install
  ```
- **"AnimForge Studio is already running" or port `1420` in use:**  
  Double-click **`STOP-ANIMFORGE.command`** or run:
  ```bash
  "/Users/vipinkumar/Desktop/animator /AnimForgeLab/STOP-ANIMFORGE.command"
  ```
- **Rust / Cargo missing:** Install via official installer from <https://rustup.rs> and reopen Terminal.
