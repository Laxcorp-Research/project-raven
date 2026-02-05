"use strict";
const electron = require("electron");
const api = {
  // Stealth
  toggleStealth: (enabled) => electron.ipcRenderer.invoke("toggle-stealth", enabled),
  // Window controls
  hideWindow: () => electron.ipcRenderer.send("hide-window"),
  closeWindow: () => electron.ipcRenderer.send("close-window"),
  minimizeWindow: () => electron.ipcRenderer.send("minimize-window")
};
electron.contextBridge.exposeInMainWorld("raven", api);
