const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { fork } = require('child_process');

let mainWindow;
let backendProcess;
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

// Persist a random JWT secret in userData so production
// never relies on a hardcoded default.
function getOrCreateJwtSecret() {
  const secretPath = path.join(
    app.getPath('userData'),
    'jwt.secret'
  );

  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf8').trim();
  }

  const secret = crypto.randomBytes(48).toString('hex');

  fs.mkdirSync(path.dirname(secretPath), {
    recursive: true
  });

  fs.writeFileSync(secretPath, secret, {
    mode: 0o600
  });

  return secret;
}

// The SQLite database must live in a writable location.
// Keep the existing database filename so the packaged
// application uses the existing WorkSync database.
function getDatabasePath() {
  const dbDir = path.join(
    app.getPath('userData'),
    'database'
  );

  fs.mkdirSync(dbDir, {
    recursive: true
  });

  const databasePath = path.join(
    dbDir,
    'worksync.sqlite'
  );

  console.log('========================================');
  console.log('[ELECTRON] Packaged database configuration');
  console.log('[ELECTRON] Database directory:', dbDir);
  console.log('[ELECTRON] Database path:', databasePath);
  console.log(
    '[ELECTRON] Database exists:',
    fs.existsSync(databasePath)
  );

  if (fs.existsSync(databasePath)) {
    const stats = fs.statSync(databasePath);

    console.log(
      '[ELECTRON] Database size:',
      stats.size,
      'bytes'
    );

    console.log(
      '[ELECTRON] Database modified:',
      stats.mtime
    );
  }

  console.log('========================================');

  return databasePath;
}

// The packaged application excludes the repository .env file, so the
// forked backend would receive no PostgreSQL configuration. Read an
// optional .env file placed next to the executable (or in resources)
// and forward the PostgreSQL variables to the backend child process.
// The password is never logged; only whether it is configured.
function loadPackagedPostgresEnv(env) {
  const candidates = [
    path.join(path.dirname(app.getPath('exe')), '.env'),
    path.join(process.resourcesPath, '.env')
  ];

  const envFile = candidates.find((candidate) => fs.existsSync(candidate));

  console.log(
    '[ELECTRON] PostgreSQL .env file:',
    envFile || 'not found'
  );

  if (!envFile) {
    console.log('[ELECTRON] Password configured: false');
    return;
  }

  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);

    if (!match) continue;

    const key = match[1];
    let value = match[2];

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Never override variables already set in the environment.
    if (!(key in env)) {
      env[key] = value;
    }
  }

  console.log('[ELECTRON] PGHOST:', env.PGHOST || '(not set)');
  console.log('[ELECTRON] PGPORT:', env.PGPORT || '(not set)');
  console.log('[ELECTRON] PGDATABASE:', env.PGDATABASE || '(not set)');
  console.log('[ELECTRON] PGUSER:', env.PGUSER || '(not set)');
  console.log(
    '[ELECTRON] Password configured:',
    Boolean(env.PGPASSWORD)
  );
}

function startBackend() {
  const backendPath = app.isPackaged
    ? path.join(
        process.resourcesPath,
        'backend',
        'server.js'
      )
    : path.join(
        __dirname,
        '../backend/server.js'
      );

  const env = {
    ...process.env,
    PORT: '3000',
    NODE_ENV: app.isPackaged
      ? 'production'
      : 'development'
  };

  if (app.isPackaged) {
    env.DATABASE_PATH = getDatabasePath();
    env.JWT_SECRET = getOrCreateJwtSecret();
    env.FRONTEND_URL = frontendServerUrl;
    env.ELECTRON_PACKAGED = 'true';

    loadPackagedPostgresEnv(env);

    console.log(
      '[ELECTRON] DATABASE_PATH:',
      env.DATABASE_PATH
    );
  }

  backendProcess = fork(
    backendPath,
    [],
    {
      cwd: path.dirname(backendPath),
      env
    }
  );

  backendProcess.on('error', (error) => {
    console.error(
      'Failed to start backend:',
      error
    );
  });

  backendProcess.on('spawn', () => {
    console.log(
      `Backend started from: ${backendPath}`
    );
  });

  backendProcess.on('exit', (code, signal) => {
    console.error(
      `Backend exited prematurely: code=${code} signal=${signal}`
    );
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

    startBackend();
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
  if (backendProcess) {
    backendProcess.kill();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }

  if (frontendServer) {
    frontendServer.close();
  }
});