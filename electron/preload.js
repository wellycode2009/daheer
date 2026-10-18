"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    platform: process.platform, // app.ts uses this to apply the macOS window styling (it was never exposed before)
    load: () => electron_1.ipcRenderer.sendSync('daheer:loadSync'),
    save: (raw) => electron_1.ipcRenderer.invoke('daheer:save', raw),
    saveSync: (raw) => electron_1.ipcRenderer.sendSync('daheer:saveSync', raw),
    loadFont: (name) => electron_1.ipcRenderer.invoke('daheer:loadFont', name),
    authStatus: () => electron_1.ipcRenderer.sendSync('daheer:authStatus'),
    authEnableLock: (password) => electron_1.ipcRenderer.invoke('daheer:authEnableLock', password),
    authDisableLock: (password) => electron_1.ipcRenderer.invoke('daheer:authDisableLock', password),
    authAddProfile: (input) => electron_1.ipcRenderer.invoke('daheer:authAddProfile', input),
    authSignIn: (input) => electron_1.ipcRenderer.invoke('daheer:authSignIn', input),
    authSwitchProfile: (input) => electron_1.ipcRenderer.invoke('daheer:authSwitchProfile', input),
    authSetName: (name) => electron_1.ipcRenderer.invoke('daheer:authSetName', name)
};
electron_1.contextBridge.exposeInMainWorld('daheerNative', api);
