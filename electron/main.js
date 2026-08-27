const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let frontendServer;
let frontendServerUrl;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sendFile(response, filePath) {
  response.writeHead(200, {
    'Content-Type':
      contentTypes[path.extname(filePath).toLowerCase()] ||
      'application/octet-stream',
    'Cache-Control':
      path.basename(filePath) === 'index.html'
        ? 'no-cache'
        : 'public, max-age=31536000, immutable'
  });

  fs.createReadStream(filePath)
    .on('error', () => response.destroy())
    .pipe(response);
}

function startFrontendServer() {
  const frontendRoot = path.join(
    process.resourcesPath,
    'frontend',
    'dist',
    'spa'
  );

  const indexPath = path.join(frontendRoot, 'index.html');

  console.log(`Serving packaged frontend from: ${frontendRoot}`);
  console.log(
    `Packaged frontend index.html exists: ${fs.existsSync(indexPath)}`
  );

  frontendServer = http.createServer((request, response) => {
    if (!request.url || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }

    let pathname;

    try {
      pathname = decodeURIComponent(
        new URL(request.url, 'http://127.0.0.1').pathname
      );
    } catch {
      response.writeHead(400).end();
      return;
    }

    const requestedPath = path.resolve(
      frontendRoot,
      `.${pathname}`
    );

    const isInsideFrontendRoot =
      requestedPath === frontendRoot ||
      requestedPath.startsWith(`${frontendRoot}${path.sep}`);

    if (!isInsideFrontendRoot) {
      response.writeHead(403).end();
      return;
    }

    const filePath =
      fs.existsSync(requestedPath) &&
      fs.statSync(requestedPath).isFile()
        ? requestedPath
        : path.extname(pathname)
          ? null
          : indexPath;

    if (!filePath || !fs.existsSync(filePath)) {
      response.writeHead(404).end();
      return;
    }

    if (request.method === 'HEAD') {
      response
        .writeHead(200, {
          'Content-Type':
            contentTypes[path.extname(filePath).toLowerCase()] ||
            'application/octet-stream'
        })
        .end();

      return;
    }

    sendFile(response, filePath);
  });

  return new Promise((resolve, reject) => {
    frontendServer.once('error', reject);

    frontendServer.listen(0, '127.0.0.1', () => {
      frontendServer.removeListener('error', reject);

      const { port } = frontendServer.address();

      frontendServerUrl = `http://127.0.0.1:${port}`;

      console.log(
        `Packaged frontend server URL: ${frontendServerUrl}`
      );

      resolve();
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: true,

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (!app.isPackaged) {
    mainWindow.loadURL(
      'http://localhost:9001'
    );
  } else {
    mainWindow.loadURL(
      `${frontendServerUrl}/`
    );
  }
}

app.whenReady()
  .then(async () => {
    if (app.isPackaged) {
      await startFrontendServer();
    }

    createWindow();
  })
  .catch((error) => {
    console.error(
      'Failed to initialize WorkSync:',
      error
    );

    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (frontendServer) {
    frontendServer.close();
  }
});