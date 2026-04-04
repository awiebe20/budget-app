const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const BACKEND_PORT = 3001;
let mainWindow;

function setupDatabase(isDev) {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'budget.db');

  console.log('[db] isDev:', isDev);
  console.log('[db] __dirname:', __dirname);
  console.log('[db] userDataPath:', userDataPath);
  console.log('[db] dbPath:', dbPath);
  console.log('[db] dbPath exists:', fs.existsSync(dbPath));

  if (!fs.existsSync(dbPath)) {
    const blankDb = isDev
      ? path.join(__dirname, 'blank.db')
      : path.join(process.resourcesPath, 'blank.db');

    console.log('[db] blankDb path:', blankDb);
    console.log('[db] blankDb exists:', fs.existsSync(blankDb));

    if (fs.existsSync(blankDb)) {
      fs.copyFileSync(blankDb, dbPath);
      console.log('[db] Copied blank database to', dbPath);
      console.log('[db] dbPath exists after copy:', fs.existsSync(dbPath));
    } else {
      console.log('[db] No blank.db found — backend will create schema on first connect');
    }
  } else {
    console.log('[db] Using existing database at', dbPath);
  }

  // Prisma requires forward slashes even on Windows
  const dbUrl = dbPath.replace(/\\/g, '/');
  process.env.DATABASE_URL = `file:${dbUrl}`;
  process.env.PORT = String(BACKEND_PORT);
  console.log('[db] DATABASE_URL set to:', process.env.DATABASE_URL);
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
    console.log('[electron] Backend loaded');
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
    },
    show: false,
  });

  const builtFrontend = path.join(__dirname, '../frontend/dist/index.html');
  const url = (isDev && !fs.existsSync(builtFrontend))
    ? 'http://localhost:5173'
    : `file://${builtFrontend}`;

  mainWindow.loadURL(url);
  mainWindow.webContents.openDevTools();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow(!app.isPackaged);
});