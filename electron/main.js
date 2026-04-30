const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const log = require('electron-log');
log.transports.file.level = 'info';

const BACKEND_PORT = 3001;
let mainWindow;

function setupDatabase(isDev) {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'budget.db');

  if (!fs.existsSync(dbPath)) {
    const blankDb = isDev
      ? path.join(__dirname, 'blank.db')
      : path.join(process.resourcesPath, 'blank.db');

    if (fs.existsSync(blankDb)) {
      fs.copyFileSync(blankDb, dbPath);
    }
  }

  const dbUrl = dbPath.replace(/\\/g, '/');
  process.env.DATABASE_URL = `file:${dbUrl}`;
  process.env.PORT = String(BACKEND_PORT);
}

function startBackend(isDev) {
  const backendEntry = isDev
    ? path.join(__dirname, '../backend/dist/index.js')
    : path.join(process.resourcesPath, 'backend/dist/index.js');

  if (!fs.existsSync(backendEntry)) {
    dialog.showErrorBox(
      'Backend not built',
      `Could not find ${backendEntry}\n\nRun: npm run build:backend`
    );
    app.quit();
    return;
  }

  try {
    require(backendEntry);
  } catch (err) {
    dialog.showErrorBox('Backend failed to start', String(err));
    app.quit();
  }
}

function waitForBackend(retries = 40) {
  return new Promise((resolve, reject) => {
    const check = (remaining) => {
      if (remaining === 0) return reject(new Error('Backend did not start in time'));
      const req = http.get(`http://localhost:${BACKEND_PORT}/api/onboarding/status`, () => {
        resolve();
      });
      req.on('error', () => setTimeout(() => check(remaining - 1), 500));
      req.setTimeout(400, () => { req.destroy(); setTimeout(() => check(remaining - 1), 500); });
    };
    check(retries);
  });
}

function createWindow(isDev) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111827',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#111827',
      symbolColor: '#ffffff',
      height: 40,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  const builtFrontend = path.join(__dirname, '../frontend/dist/index.html');
  const url = (isDev && !fs.existsSync(builtFrontend))
    ? 'http://localhost:5173'
    : `file://${builtFrontend}`;

  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function setupAutoUpdater() {
  // Only run in packaged app
  if (!app.isPackaged) return;

  const { autoUpdater } = require('electron-updater');

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.webContents.send('update-downloaded');
  });

  autoUpdater.logger = log;

  autoUpdater.on('checking-for-update', () => log.info('Checking for update...'));
  autoUpdater.on('update-available', (info) => log.info('Update available:', info.version));
  autoUpdater.on('update-not-available', (info) => log.info('No update available, current:', info.version));
  autoUpdater.on('download-progress', (p) => log.info(`Download progress: ${Math.round(p.percent)}%`));
  autoUpdater.on('error', (err) => log.error('Auto-updater error:', err));

  // Check on startup, then every 4 hours
  autoUpdater.checkForUpdates();
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.on('restart-and-install', () => {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.quitAndInstall();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const isDev = !app.isPackaged;

  setupDatabase(isDev);
  startBackend(isDev);

  try {
    await waitForBackend();
  } catch (err) {
    dialog.showErrorBox('Startup failed', 'Backend did not respond. Try restarting the app.');
    app.quit();
    return;
  }

  createWindow(isDev);
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow(!app.isPackaged);
});