const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const serverless = require('serverless-http');

const app = express();
const FLASK_HOST = process.env.FLASK_HOST || '127.0.0.1';
const FLASK_PORT = Number(process.env.FLASK_PORT || 8080);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const WSGI_PATH = path.join(PROJECT_ROOT, 'wsgi.py');

app.use(express.raw({ type: '*/*', limit: '25mb' }));

let flaskProcess = null;
let flaskStartupPromise = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFlaskReachable() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: FLASK_HOST, port: FLASK_PORT }, () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      resolve(false);
    });
  });
}

async function startFlaskServer() {
  flaskProcess = spawn('python', [WSGI_PATH], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });

  flaskProcess.on('exit', () => {
    flaskProcess = null;
    flaskStartupPromise = null;
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isFlaskReachable()) {
      return;
    }
    await delay(500);
  }

  throw new Error('Flask server did not start in time.');
}

async function ensureFlaskServer() {
  if (await isFlaskReachable()) {
    return;
  }

  if (!flaskStartupPromise) {
    flaskStartupPromise = startFlaskServer();
  }

  await flaskStartupPromise;
}

app.all('*', async (req, res) => {
  try {
    await ensureFlaskServer();
  } catch (error) {
    console.error('Unable to start Flask app:', error.message);
    res.status(500).send('Error connecting to the application server');
    return;
  }

  const headers = { ...req.headers, host: `${FLASK_HOST}:${FLASK_PORT}` };
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (body.length > 0) {
    headers['content-length'] = String(body.length);
  } else {
    delete headers['content-length'];
  }

  const proxyReq = http.request(
    {
      hostname: FLASK_HOST,
      port: FLASK_PORT,
      path: req.originalUrl,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    console.error('Error connecting to Flask app:', error.message);
    if (!res.headersSent) {
      res.status(500).send('Error connecting to the application server');
    }
  });

  if (body.length > 0) {
    proxyReq.write(body);
  }

  proxyReq.end();
});

function stopFlaskServer() {
  if (flaskProcess) {
    flaskProcess.kill();
    flaskProcess = null;
  }
}

process.on('exit', stopFlaskServer);
process.on('SIGINT', () => {
  stopFlaskServer();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopFlaskServer();
  process.exit(0);
});

module.exports.handler = serverless(app);
