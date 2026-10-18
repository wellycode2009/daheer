"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
// COSMIC is Wayland-first. Let Electron use native Wayland when available.
if (process.platform === 'linux') {
    electron_1.app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}
const DATA_FILE = path.join(electron_1.app.getPath('userData'), 'daheer-state.json');
const ACCOUNT_FILE = path.join(electron_1.app.getPath('userData'), 'daheer-accounts.json');
const PROFILE_DIR = path.join(electron_1.app.getPath('userData'), 'profiles');
const THMANYAH_ROOT = process.env.DAHEER_THMANYAH_FONT_DIR || path.join(os.homedir(), '.local', 'share', 'daheer', 'thmanyah-fonts');
const THMANYAH_FILES = new Set(['thmanyahsans', 'thmanyahserifdisplay', 'thmanyahseriftext'].flatMap(f => ['Light', 'Regular', 'Medium', 'Bold', 'Black'].map(w => `${f}-${w}.woff2`))); // must match AR_FONTS in src/js/i18n.js and tools/install-thmanyah.js (15 files)
let accounts = null; // filled lazily by readAccounts()
let activeProfileId = 'main';
let sessionUnlocked = true;
function writeJson(file, value) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
}
function readAccounts() {
    if (accounts)
        return accounts;
    try {
        accounts = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
    }
    catch (e) {
        accounts = { lockEnabled: false, activeProfileId: 'main', profiles: [{ id: 'main', name: 'Account', salt: '', passwordHash: '' }] };
        writeJson(ACCOUNT_FILE, accounts);
    }
    if (!Array.isArray(accounts.profiles) || !accounts.profiles.length)
        accounts.profiles = [{ id: 'main', name: 'Account', salt: '', passwordHash: '' }];
    activeProfileId = accounts.profiles.some(p => p.id === accounts.activeProfileId) ? accounts.activeProfileId : accounts.profiles[0].id;
    sessionUnlocked = !accounts.lockEnabled;
    return accounts;
}
function saveAccounts() { writeJson(ACCOUNT_FILE, accounts); }
function profilePath(id) {
    if (!/^[a-z0-9_-]+$/i.test(id))
        throw new Error('Invalid profile');
    return path.join(PROFILE_DIR, id + '.json');
}
function loadState() {
    readAccounts();
    if (!sessionUnlocked)
        return null;
    try {
        return fs.readFileSync(profilePath(activeProfileId), 'utf8');
    }
    catch (e) {
        // Keep older single-profile installations intact and adopt their data lazily.
        if (activeProfileId === 'main') {
            try {
                return fs.readFileSync(DATA_FILE, 'utf8');
            }
            catch (legacyError) { }
        }
        return null;
    }
}
function saveState(raw) {
    readAccounts();
    if (!sessionUnlocked || typeof raw !== 'string')
        return false;
    try {
        fs.mkdirSync(PROFILE_DIR, { recursive: true });
        writeJson(profilePath(activeProfileId), JSON.parse(raw));
        return true;
    }
    catch (e) {
        console.error('save failed', e);
        return false;
    }
}
function publicProfiles() {
    return readAccounts().profiles.map(p => ({ id: p.id, name: p.name || 'Account', hasPassword: !!p.passwordHash }));
}
function authStatus() {
    readAccounts();
    return { lockEnabled: !!accounts.lockEnabled, locked: !!accounts.lockEnabled && !sessionUnlocked, activeProfileId, profiles: publicProfiles() };
}
function passwordRecord(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, passwordHash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function passwordMatches(profile, password) {
    if (!profile || !profile.passwordHash)
        return !password && !accounts.lockEnabled;
    try {
        const actual = crypto.scryptSync(String(password || ''), profile.salt, 64);
        const expected = Buffer.from(profile.passwordHash, 'hex');
        return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    }
    catch (e) {
        return false;
    }
}
function authReply(ok, error) {
    const result = { ok: !!ok, error: error || null, status: authStatus() };
    if (ok)
        result.state = loadState();
    return result;
}
function loadFont(name) {
    if (!THMANYAH_FILES.has(name))
        throw new Error('Unknown font: ' + name);
    const file = path.join(THMANYAH_ROOT, name);
    return fs.readFileSync(file);
}
let win;
function createWindow() {
    const w = win = new electron_1.BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 860,
        minHeight: 560,
        show: false,
        fullscreenable: true,
        backgroundColor: '#F3F6EC',
        icon: path.join(__dirname, '..', 'src', 'assets', 'logo', 'daheer-icon-dark.png'),
        // plugins:true turns on Chromium's built-in PDFium viewer so the Tools > PDF
        // reader can embed a local file straight in an <iframe>/<embed> with no bundled library.
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, plugins: true },
        autoHideMenuBar: true
    });
    w.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
    w.once('ready-to-show', () => {
        w.show();
        // COSMIC handles a normal maximize request without changing the app's content viewport. Keep fullscreen opt-in from the OS/UI instead of
        // forcing it at startup.
        setTimeout(() => {
            if (w.isDestroyed())
                return;
            if (!w.isMaximized())
                w.maximize();
        }, 50);
    });
}
electron_1.ipcMain.on('daheer:loadSync', (evt) => { evt.returnValue = loadState(); });
electron_1.ipcMain.handle('daheer:save', (evt, raw) => saveState(raw));
electron_1.ipcMain.on('daheer:saveSync', (evt, raw) => { evt.returnValue = saveState(raw); });
electron_1.ipcMain.handle('daheer:loadFont', (evt, name) => loadFont(name));
electron_1.ipcMain.on('daheer:authStatus', (evt) => { evt.returnValue = authStatus(); });
electron_1.ipcMain.handle('daheer:authEnableLock', (evt, password) => {
    readAccounts();
    if (!sessionUnlocked)
        return authReply(false, 'locked');
    if (typeof password !== 'string' || password.length < 4)
        return authReply(false, 'password-short');
    const current = accounts.profiles.find(p => p.id === activeProfileId);
    Object.assign(current, passwordRecord(password));
    accounts.lockEnabled = true;
    sessionUnlocked = true;
    saveAccounts();
    return authReply(true);
});
electron_1.ipcMain.handle('daheer:authDisableLock', (evt, password) => {
    readAccounts();
    const current = accounts.profiles.find(p => p.id === activeProfileId);
    if (!passwordMatches(current, password))
        return authReply(false, 'password-wrong');
    accounts.lockEnabled = false;
    sessionUnlocked = true;
    saveAccounts();
    return authReply(true);
});
electron_1.ipcMain.handle('daheer:authAddProfile', (evt, input) => {
    readAccounts();
    input = input || {};
    const name = String(input.name || '').trim().slice(0, 40), password = String(input.password || '');
    if (!name)
        return authReply(false, 'name-required');
    if (password.length < 4)
        return authReply(false, 'password-short');
    if (accounts.profiles.some(p => String(p.name).toLowerCase() === name.toLowerCase()))
        return authReply(false, 'name-taken');
    const profile = Object.assign({ id: 'p-' + crypto.randomBytes(8).toString('hex'), name }, passwordRecord(password));
    accounts.profiles.push(profile);
    saveAccounts();
    return authReply(true);
});
electron_1.ipcMain.handle('daheer:authSignIn', (evt, input) => {
    readAccounts();
    input = input || {};
    const profile = accounts.profiles.find(p => p.id === input.profileId);
    if (!profile || !passwordMatches(profile, input.password))
        return authReply(false, 'password-wrong');
    activeProfileId = profile.id;
    accounts.activeProfileId = profile.id;
    sessionUnlocked = true;
    saveAccounts();
    return authReply(true);
});
electron_1.ipcMain.handle('daheer:authSwitchProfile', (evt, input) => {
    readAccounts();
    input = input || {};
    const profile = accounts.profiles.find(p => p.id === input.profileId);
    if (!profile)
        return authReply(false, 'profile-not-found');
    // A password is always required while the app lock is enabled.  Profiles
    // without a password only exist in the deliberately-unlocked mode.
    if (accounts.lockEnabled && !passwordMatches(profile, input.password))
        return authReply(false, 'password-wrong');
    activeProfileId = profile.id;
    accounts.activeProfileId = profile.id;
    sessionUnlocked = true;
    saveAccounts();
    return authReply(true);
});
electron_1.ipcMain.handle('daheer:authSetName', (evt, name) => {
    readAccounts();
    const current = accounts.profiles.find(p => p.id === activeProfileId);
    if (current && String(name || '').trim()) {
        current.name = String(name).trim().slice(0, 40);
        saveAccounts();
    }
    return authStatus();
});
electron_1.app.whenReady().then(() => {
    electron_1.Menu.setApplicationMenu(null);
    createWindow();
    electron_1.app.on('activate', () => { if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow(); });
});
electron_1.app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    electron_1.app.quit(); });
