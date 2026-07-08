const { app, BrowserWindow, Menu } = require('electron');

Menu.setApplicationMenu(null); // kein Datei/Bearbeiten-Menü — fühlt sich wie ein echtes Spiel an

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'UNTOT — Zombies',
    autoHideMenuBar: true,
    backgroundColor: '#04050a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // erlaubt lokale GLB/Textur-Ladung ohne CORS-Probleme
    },
  });

  mainWindow.loadFile('index.html');

  // F11 schaltet Vollbild um — Standard-Erwartung bei Spielen
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
