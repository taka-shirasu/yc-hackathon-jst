const { app, BrowserWindow, ipcMain, systemPreferences } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const isDev = process.env.NODE_ENV !== 'production';

let mainWindow;
let asrServerProcess = null;

// Start ASR server
function startASRServer() {
  // Kill any existing process on port 8000
  try {
    execSync('lsof -ti:8000 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' });
  } catch (e) {
    // Ignore errors
  }
  
  const serverPath = path.join(__dirname, 'asr-server.js');
  asrServerProcess = spawn('node', [serverPath], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: false
  });

  asrServerProcess.on('error', (error) => {
    console.error('Failed to start ASR server:', error);
  });

  asrServerProcess.on('exit', (code) => {
    console.log(`ASR server exited with code ${code}`);
    asrServerProcess = null;
  });

  return asrServerProcess;
}

// Stop ASR server
function stopASRServer() {
  if (asrServerProcess) {
    asrServerProcess.kill();
    asrServerProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#f5f5f5',
    show: false, // Don't show until ready
  });

  if (isDev) {
    // Wait for React dev server to be ready, then load
    const checkServer = setInterval(() => {
      const req = http.get('http://localhost:3000', (res) => {
        if (res.statusCode === 200) {
          clearInterval(checkServer);
          mainWindow.loadURL('http://localhost:3000');
          mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.show();
            mainWindow.webContents.openDevTools();
          });
        }
      });
      req.on('error', () => {
        // Server not ready yet, keep checking
      });
      req.setTimeout(1000, () => {
        req.destroy();
      });
    }, 500);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkServer);
      if (!mainWindow.webContents.getURL()) {
        console.error('React dev server did not start in time');
        mainWindow.loadURL('http://localhost:3000'); // Try anyway
        mainWindow.show();
      }
    }, 30000);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Handle page load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load page:', errorCode, errorDescription);
    if (isDev) {
      mainWindow.loadURL('http://localhost:3000');
    }
  });
}

app.whenReady().then(async () => {
  // Request microphone permission on Mac
  if (process.platform === 'darwin') {
    try {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      if (status !== 'granted') {
        const result = await systemPreferences.askForMediaAccess('microphone');
        if (!result) {
          console.warn('Microphone permission denied');
        }
      }
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
    }
  }

  // Start ASR server
  startASRServer();

  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopASRServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopASRServer();
});

// IPC handlers
ipcMain.handle('get-microphone-permission', async () => {
  if (process.platform === 'darwin') {
    try {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      if (status !== 'granted') {
        const result = await systemPreferences.askForMediaAccess('microphone');
        return result;
      }
      return true;
    } catch (error) {
      console.error('Error checking microphone permission:', error);
      return false;
    }
  }
  return true;
});

