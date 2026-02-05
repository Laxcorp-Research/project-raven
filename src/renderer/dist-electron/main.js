import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const __dirname$1 = dirname(fileURLToPath(import.meta.url));
function enableStealth(window) {
  window.setContentProtection(true);
  console.log("[Stealth] Content protection enabled");
}
function disableStealth(window) {
  window.setContentProtection(false);
  console.log("[Stealth] Content protection disabled");
}
let mainWindow = null;
function createWindow() {
  var _a;
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 480;
  const windowHeight = 380;
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 400,
    minHeight: 300,
    maxWidth: 800,
    maxHeight: 600,
    x: screenWidth - windowWidth - 20,
    y: screenHeight - windowHeight - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: true,
    ...process.platform === "darwin" ? {
      vibrancy: "dark",
      visualEffectState: "active"
    } : {},
    webPreferences: {
      preload: join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setAlwaysOnTop(true, "floating", 1);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  enableStealth(mainWindow);
  if (process.platform === "darwin") {
    (_a = app.dock) == null ? void 0 : _a.hide();
  }
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(join(__dirname$1, "../dist/index.html"));
  }
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}
function registerIpcHandlers() {
  ipcMain.handle("toggle-stealth", (_event, enabled) => {
    if (!mainWindow) return;
    if (enabled) {
      enableStealth(mainWindow);
    } else {
      disableStealth(mainWindow);
    }
  });
  ipcMain.on("hide-window", () => {
    mainWindow == null ? void 0 : mainWindow.hide();
  });
  ipcMain.on("close-window", () => {
    mainWindow == null ? void 0 : mainWindow.close();
  });
  ipcMain.on("minimize-window", () => {
    mainWindow == null ? void 0 : mainWindow.minimize();
  });
}
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
