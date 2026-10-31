const http = require('http');
const fs = require('fs');
const path = require('path');
const { SlskClient } = require('slsk-client');

const PORT = 12339;
const CONFIG_PATH = path.join(__dirname, 'soulseek-config.json');
const DEFAULT_DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');

// Persistent configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[Soulseek] Error reading config:', err);
  }
  return { downloads_dir: DEFAULT_DOWNLOADS_DIR, shared_dir: DEFAULT_DOWNLOADS_DIR };
}

function saveConfig(cfg) {
  try {
    const safeCfg = {
      downloads_dir: cfg.downloads_dir || DEFAULT_DOWNLOADS_DIR,
      shared_dir: cfg.shared_dir || DEFAULT_DOWNLOADS_DIR
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(safeCfg, null, 2), 'utf8');
  } catch (err) {
    console.error('[Soulseek] Error saving config:', err);
  }
}

let appConfig = loadConfig();
let DOWNLOADS_DIR = appConfig.downloads_dir || DEFAULT_DOWNLOADS_DIR;
let SHARED_DIR = appConfig.shared_dir || DOWNLOADS_DIR;

// Session credentials held only in memory during active power-on
let currentUsername = '';
let currentPassword = '';

// Ensure downloads directory exists
try {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('[Soulseek] Error creating initial downloads directory:', e);
}

let slskClient = null;
let isConnected = false;
let isConnecting = false;
let lastError = null;

// Search state cache
let searchResultsCache = new Map(); // token -> items[]
let currentSearchToken = 0;

const TRANSFERS_CACHE_PATH = path.join(__dirname, 'soulseek-transfers.json');

// Downloads tracker
let activeDownloads = new Map(); // id -> transfer info

function saveTransfers() {
  try {
    const list = [];
    for (const d of activeDownloads.values()) {
      list.push({
        id: d.id,
        username: d.username,
        virtual_path: d.virtual_path,
        filename: d.filename,
        size: d.size || 0,
        speed: 0,
        progress_pct: d.progress_pct || 0,
        bytes_downloaded: d.bytes_downloaded || 0,
        status: (d.status === 'Transferring' || d.status === 'Queued') ? 'Paused' : d.status,
        queue_position: d.queue_position || 0,
        local_file: d.local_file,
        part_file: d.part_file || (d.local_file ? d.local_file + '.part' : ''),
        created_at: d.created_at || Date.now(),
        updated_at: Date.now()
      });
    }
    const tempFile = `${TRANSFERS_CACHE_PATH}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tempFile, TRANSFERS_CACHE_PATH);
  } catch (err) {
    console.error('[Soulseek] Error saving transfers cache:', err);
  }
}

function loadTransfers() {
  try {
    if (fs.existsSync(TRANSFERS_CACHE_PATH)) {
      const raw = fs.readFileSync(TRANSFERS_CACHE_PATH, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (!item.id && (!item.username || !item.virtual_path)) continue;
          const id = item.id || `${item.username}:${item.virtual_path}`;
          const norm = (item.virtual_path || '').replace(/\\/g, '/');
          const filename = item.filename || path.basename(norm);
          const localFile = item.local_file || path.join(DOWNLOADS_DIR, filename);
          const partFile = item.part_file || (localFile + '.part');

          let bytesOnDisk = 0;
          let isCompleteOnDisk = false;

          if (fs.existsSync(localFile)) {
            try {
              const stat = fs.statSync(localFile);
              if (item.size > 0 && stat.size >= item.size) {
                isCompleteOnDisk = true;
                bytesOnDisk = stat.size;
              }
            } catch (_) {}
          }

          if (!isCompleteOnDisk && fs.existsSync(partFile)) {
            try {
              bytesOnDisk = fs.statSync(partFile).size;
            } catch (_) {}
          }

          let status = item.status;
          let progress_pct = item.progress_pct || 0;

          if (isCompleteOnDisk || status === 'Finished') {
            status = 'Finished';
            progress_pct = 100;
          } else {
            if (status === 'Transferring' || status === 'Queued') {
              status = 'Paused';
            }
            if (item.size > 0 && bytesOnDisk > 0) {
              progress_pct = Math.min(99, Math.round((bytesOnDisk / item.size) * 100));
            }
          }

          const entry = {
            id,
            username: item.username,
            virtual_path: item.virtual_path,
            filename,
            size: item.size || 0,
            speed: 0,
            progress_pct,
            bytes_downloaded: bytesOnDisk,
            status,
            queue_position: 0,
            local_file: localFile,
            part_file: partFile,
            created_at: item.created_at || Date.now(),
            userPaused: status === 'Paused',
            userCancelled: status === 'Cancelled',
            downloadHandle: null,
            writeStream: null
          };

          activeDownloads.set(id, entry);
        }
        console.log(`[Soulseek] Restored ${activeDownloads.size} transfers from persistent cache`);
      }
    }
  } catch (err) {
    console.error('[Soulseek] Error loading transfers cache:', err);
  }
}

async function initClient(username, password) {
  if (isConnecting) return { ok: false, message: 'Connection already in progress' };
  isConnecting = true;
  lastError = null;

  try {
    if (slskClient) {
      try { slskClient.destroy(); } catch (_) {}
      slskClient = null;
    }

    slskClient = new SlskClient();

    slskClient.on('server-error', (err) => {
      console.error('[Soulseek] Server error:', err);
      lastError = err?.message || String(err);
      isConnected = false;
    });

    slskClient.on('server-disconnect', ({ reconnecting }) => {
      console.warn('[Soulseek] Disconnected, reconnecting:', reconnecting);
      isConnected = false;
    });

    slskClient.on('server-reconnect', () => {
      console.log('[Soulseek] Reconnected to server');
      isConnected = true;
      lastError = null;
    });

    console.log(`[Soulseek] Logging in as ${username}...`);
    await slskClient.login(username, password);

    isConnected = true;
    isConnecting = false;
    lastError = null;

    currentUsername = username;
    currentPassword = password;

    console.log(`[Soulseek] Successfully logged in as ${username}`);
    return { ok: true, username };
  } catch (err) {
    isConnecting = false;
    isConnected = false;
    lastError = err?.message || String(err);
    console.error('[Soulseek] Login failed:', err);
    return { ok: false, error: lastError };
  }
}

// Power off / offline by default upon start to protect shared files from immediate exposure
console.log('[Soulseek] Service initialized in OFFLINE / POWERED OFF mode (shares unexposed)');

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  function sendJson(code, data) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  // Health
  if (pathname === '/health') {
    return sendJson(200, { ok: true, status: 'healthy', node: true });
  }

  // Status
  if (pathname === '/status') {
    return sendJson(200, {
      connected: isConnected,
      connecting: isConnecting,
      powered_on: isConnected || isConnecting,
      login_username: currentUsername || 'Not logged in',
      login_status: isConnected ? 2 : (isConnecting ? 1 : 0),
      uploads_total: 0,
      downloads_total: activeDownloads.size,
      downloads_dir: DOWNLOADS_DIR,
      shared_dir: SHARED_DIR,
      error: lastError
    });
  }

  // Change Downloads Directory
  if ((pathname === '/directory' || pathname === '/config/directory') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const newDir = (body.directory || body.downloads_dir || '').trim();
    if (!newDir) {
      return sendJson(400, { ok: false, error: 'Directory path is required' });
    }
    try {
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
      }
    } catch (e) {
      return sendJson(400, { ok: false, error: 'Cannot access or create directory: ' + e.message });
    }
    DOWNLOADS_DIR = newDir;
    appConfig.downloads_dir = newDir;
    saveConfig(appConfig);
    console.log(`[Soulseek] Downloads directory updated to: ${DOWNLOADS_DIR}`);
    return sendJson(200, { ok: true, downloads_dir: DOWNLOADS_DIR });
  }

  // Change Shared Directory
  if ((pathname === '/shared_directory' || pathname === '/config/shared_directory') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const newDir = (body.directory || body.shared_dir || '').trim();
    if (!newDir) {
      return sendJson(400, { ok: false, error: 'Shared directory path is required' });
    }
    try {
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
      }
    } catch (e) {
      return sendJson(400, { ok: false, error: 'Cannot access or create directory: ' + e.message });
    }
    SHARED_DIR = newDir;
    appConfig.shared_dir = newDir;
    saveConfig(appConfig);
    console.log(`[Soulseek] Shared directory updated to: ${SHARED_DIR}`);
    return sendJson(200, { ok: true, shared_dir: SHARED_DIR });
  }

  // Power On / Power Off Endpoint
  if (pathname === '/power' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const state = (body.state || '').toLowerCase();

    if (state === 'off') {
      if (slskClient) {
        try { slskClient.destroy(); } catch (_) {}
        slskClient = null;
      }
      isConnected = false;
      isConnecting = false;
      lastError = null;
      console.log('[Soulseek] Powered OFF (disconnected from network, shares unexposed)');
      return sendJson(200, { ok: true, powered_on: false, connected: false });
    }

    if (state === 'on') {
      const username = (body.username || currentUsername).trim();
      const password = (body.password || currentPassword).trim();

      if (!username || !password) {
        return sendJson(400, { ok: false, error: 'Username and password required to connect' });
      }

      currentUsername = username;
      currentPassword = password;
      const result = await initClient(username, password);
      if (result.ok) {
        return sendJson(200, { ok: true, powered_on: true, connected: true, username: result.username });
      } else {
        return sendJson(401, { ok: false, powered_on: false, error: result.error });
      }
    }

    return sendJson(400, { ok: false, error: 'Invalid state specified' });
  }

  // Login / Set Account
  if (pathname === '/account' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const username = (body.username || '').trim();
    const password = (body.password || '').trim();

    if (!username || !password) {
      return sendJson(400, { ok: false, error: 'Username and password are required' });
    }

    currentUsername = username;
    currentPassword = password;
    const result = await initClient(username, password);
    if (result.ok) {
      return sendJson(200, { ok: true, username: result.username });
    } else {
      return sendJson(401, { ok: false, error: result.error });
    }
  }

  // Get current account info (without exposing password)
  if (pathname === '/account' && req.method === 'GET') {
    return sendJson(200, {
      ok: true,
      username: currentUsername || '',
      hasPassword: Boolean(currentPassword),
      connected: isConnected,
      connecting: isConnecting,
      powered_on: isConnected || isConnecting,
      error: lastError
    });
  }

  // Disconnect / Logout
  if (pathname === '/logout' && req.method === 'POST') {
    if (slskClient) {
      try { slskClient.destroy(); } catch (_) {}
      slskClient = null;
    }
    isConnected = false;
    isConnecting = false;
    currentUsername = '';
    currentPassword = '';
    lastError = null;
    console.log('[Soulseek] Logged out and credentials cleared from memory');
    return sendJson(200, { ok: true });
  }

  // Search
  if (pathname === '/search' && req.method === 'POST') {
    if (!isConnected || !slskClient) {
      return sendJson(503, { ok: false, error: 'Soulseek client is not connected to the network' });
    }

    const body = await parseJsonBody(req);
    const query = (body.query || '').trim();
    if (!query) {
      return sendJson(400, { ok: false, error: 'Query is required' });
    }

    currentSearchToken++;
    const token = currentSearchToken;
    searchResultsCache.set(token, []);

    // Perform search in background
    (async () => {
      try {
        const rawResults = await slskClient.search({
          req: query,
          timeout: 4500
        });

        const items = [];
        for (const r of rawResults) {
          items.push({
            username: r.user || '',
            file_path: r.file || '',
            size: r.size || 0,
            free_upload_slots: Boolean(r.slots),
            queue_position: r.queueLength || 0,
            upload_speed: r.speed || 0,
            extension: path.extname(r.file || '').replace(/^\./, '').toLowerCase(),
            file_attributes: {
              '0': r.attribs?.[0] || null, // bitrate
              '1': r.attribs?.[1] || null, // duration
              '3': r.attribs?.[3] || null, // samplerate
              '4': r.attribs?.[4] || null  // bitdepth
            }
          });
        }
        searchResultsCache.set(token, items);
      } catch (err) {
        console.error('[Soulseek] Search error:', err);
      }
    })();

    return sendJson(200, { ok: true, token });
  }

  // Search Results
  if (pathname === '/search/results' && req.method === 'GET') {
    const token = parseInt(parsedUrl.searchParams.get('token'), 10);
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '150', 10);
    const offset = parseInt(parsedUrl.searchParams.get('offset') || '0', 10);

    const items = searchResultsCache.get(token) || [];
    const sliced = items.slice(offset, offset + limit);

    return sendJson(200, {
      token,
      total: items.length,
      items: sliced
    });
  }

function normPath(p) {
  return (p || '').replace(/\\/g, '/').toLowerCase();
}

function findDownload(body) {
  if (!body) return null;
  if (body.id && activeDownloads.has(body.id)) {
    return activeDownloads.get(body.id);
  }
  if (body.username && body.virtual_path) {
    const key = `${body.username}:${body.virtual_path}`;
    if (activeDownloads.has(key)) {
      return activeDownloads.get(key);
    }
  }

  const targetNorm = normPath(body.virtual_path || body.file || '');
  const targetUser = (body.username || '').toLowerCase();
  const targetId = body.id || '';

  for (const [key, d] of activeDownloads.entries()) {
    if (targetId && (d.id === targetId || key === targetId)) return d;
    const dNorm = normPath(d.virtual_path);
    const dUser = (d.username || '').toLowerCase();
    if (targetNorm && dNorm === targetNorm) {
      if (!targetUser || dUser === targetUser) return d;
    }
  }
  return null;
}

function startTransfer(transferEntry, reqOffset = 0) {
  if (!isConnected || !slskClient) {
    transferEntry.status = 'Error: Not connected to Soulseek';
    saveTransfers();
    return;
  }

  const partFile = transferEntry.part_file || (transferEntry.local_file + '.part');
  transferEntry.part_file = partFile;

  // Ensure downloads directory exists
  try {
    fs.mkdirSync(path.dirname(partFile), { recursive: true });
  } catch (_) {}

  // Determine actual starting offset from existing .part file on disk
  let actualOffset = reqOffset;
  if (fs.existsSync(partFile)) {
    try {
      const stat = fs.statSync(partFile);
      actualOffset = stat.size;
    } catch (_) {}
  } else {
    actualOffset = 0;
  }

  // If already fully downloaded on disk, finalize immediately
  if (transferEntry.size > 0 && actualOffset >= transferEntry.size) {
    try {
      if (fs.existsSync(partFile)) {
        fs.renameSync(partFile, transferEntry.local_file);
      }
    } catch (_) {}
    transferEntry.status = 'Finished';
    transferEntry.progress_pct = 100;
    transferEntry.speed = 0;
    transferEntry.bytes_downloaded = actualOffset;
    saveTransfers();
    return;
  }

  transferEntry.userPaused = false;
  transferEntry.userCancelled = false;
  transferEntry.status = 'Transferring';
  transferEntry.speed = 0;
  transferEntry.bytes_downloaded = actualOffset;

  if (transferEntry.size > 0 && actualOffset > 0) {
    transferEntry.progress_pct = Math.min(99, Math.round((actualOffset / transferEntry.size) * 100));
  }

  // Open write stream in append mode ('a') for real-time disk persistence
  let writeStream = null;
  try {
    writeStream = fs.createWriteStream(partFile, { flags: 'a' });
    transferEntry.writeStream = writeStream;
  } catch (err) {
    console.error(`[Soulseek] Error creating write stream for ${transferEntry.filename}:`, err);
    transferEntry.status = 'Error: Disk write error';
    saveTransfers();
    return;
  }

  let lastReceived = actualOffset;
  let lastTime = Date.now();
  let throttleSave = Date.now();

  const tempSinkPath = path.join('/tmp', `slsk_sink_${Date.now()}_${Math.random().toString(36).substring(7)}.tmp`);

  try {
    const downloadOpts = {
      user: transferEntry.username,
      file: transferEntry.virtual_path,
      size: transferEntry.size,
      path: tempSinkPath
    };
    if (actualOffset > 0) {
      downloadOpts.offset = actualOffset;
    }

    const downloadPromise = slskClient.download(downloadOpts);
    transferEntry.downloadHandle = downloadPromise;

    downloadPromise.on('status', status => {
      if (transferEntry.userPaused || transferEntry.userCancelled) return;
      if (status === 'complete') {
        // Will be completed in downloadPromise resolution
      } else if (status === 'queued') {
        transferEntry.status = 'Queued';
      } else if (status === 'downloading' || status === 'connected') {
        transferEntry.status = 'Transferring';
      } else if (status === 'failed') {
        transferEntry.status = 'Error: Transfer failed';
        transferEntry.speed = 0;
      }
    });

    downloadPromise.on('queue', place => {
      transferEntry.queue_position = place;
    });

    // Write every chunk straight to the .part file on disk in real time!
    downloadPromise.on('data', chunk => {
      if (transferEntry.userPaused || transferEntry.userCancelled) return;
      if (chunk && chunk.length > 0 && writeStream && !writeStream.destroyed) {
        writeStream.write(chunk);
        transferEntry.bytes_downloaded = (transferEntry.bytes_downloaded || 0) + chunk.length;
      }
    });

    downloadPromise.on('progress', (progressEvt) => {
      if (transferEntry.userPaused || transferEntry.userCancelled) return;
      if (progressEvt) {
        if (typeof progressEvt.progress === 'number' && !isNaN(progressEvt.progress)) {
          transferEntry.progress_pct = Math.round(progressEvt.progress * 100);
        } else if (progressEvt.totalBytes && progressEvt.receivedBytes) {
          transferEntry.progress_pct = Math.round((progressEvt.receivedBytes / progressEvt.totalBytes) * 100);
        }

        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        if (dt >= 0.5) {
          const currentBytes = progressEvt.receivedBytes || transferEntry.bytes_downloaded || 0;
          const bytesDiff = currentBytes - lastReceived;
          if (bytesDiff >= 0 && dt > 0) {
            transferEntry.speed = Math.round(bytesDiff / dt);
          }
          lastReceived = currentBytes;
          lastTime = now;
        }

        // Throttle saving transfers cache (every 3 seconds)
        if (now - throttleSave > 3000) {
          throttleSave = now;
          saveTransfers();
        }
      }
    });

    (async () => {
      try {
        await downloadPromise;
        if (!transferEntry.userPaused && !transferEntry.userCancelled) {
          // Flush and close writeStream
          if (writeStream) {
            await new Promise(res => writeStream.end(res));
            transferEntry.writeStream = null;
          }

          // Atomically rename .part file to final audio file
          try {
            if (fs.existsSync(partFile)) {
              fs.renameSync(partFile, transferEntry.local_file);
            }
          } catch (renErr) {
            console.error('[Soulseek] Failed to rename part file to final file:', renErr);
          }

          transferEntry.progress_pct = 100;
          transferEntry.status = 'Finished';
          transferEntry.speed = 0;
          saveTransfers();
          console.log(`[Soulseek] Download complete & finalized: ${transferEntry.filename}`);
        }
      } catch (err) {
        if (writeStream) {
          try { writeStream.end(); } catch (_) {}
          transferEntry.writeStream = null;
        }
        if (transferEntry.userPaused) {
          transferEntry.status = 'Paused';
          transferEntry.speed = 0;
          saveTransfers();
          return;
        }
        if (transferEntry.userCancelled) {
          saveTransfers();
          return;
        }
        console.error(`[Soulseek] Download error for ${transferEntry.filename}:`, err);
        transferEntry.status = 'Error: ' + (err?.message || 'Transfer failed');
        transferEntry.speed = 0;
        saveTransfers();
      } finally {
        transferEntry.downloadHandle = null;
        try { if (fs.existsSync(tempSinkPath)) fs.unlinkSync(tempSinkPath); } catch (_) {}
      }
    })();
  } catch (err) {
    if (writeStream) {
      try { writeStream.end(); } catch (_) {}
      transferEntry.writeStream = null;
    }
    console.error(`[Soulseek] Failed to initiate download:`, err);
    transferEntry.status = 'Error: ' + (err?.message || 'Failed to start');
    transferEntry.speed = 0;
    saveTransfers();
  }
}

  // Download / Enqueue
  if (pathname === '/downloads/enqueue' || pathname === '/search/download') {
    if (!isConnected || !slskClient) {
      return sendJson(503, { ok: false, error: 'Soulseek client is not connected' });
    }

    const body = await parseJsonBody(req);
    let username = body.username;
    let virtualPath = body.virtual_path;
    let size = body.size || 0;

    if (pathname === '/search/download' && body.token !== undefined && body.index !== undefined) {
      const items = searchResultsCache.get(parseInt(body.token, 10)) || [];
      const item = items[parseInt(body.index, 10)];
      if (item) {
        username = item.username;
        virtualPath = item.file_path;
        size = item.size;
      }
    }

    if (!username || !virtualPath) {
      return sendJson(400, { ok: false, error: 'Target user and virtual_path are required' });
    }

    const norm = virtualPath.replace(/\\/g, '/');
    const filename = path.basename(norm);
    const targetFile = path.join(DOWNLOADS_DIR, filename);
    const partFile = targetFile + '.part';

    const downloadId = `${username}:${virtualPath}`;
    const transferEntry = {
      id: downloadId,
      username,
      virtual_path: virtualPath,
      filename,
      size,
      speed: 0,
      progress_pct: 0,
      bytes_downloaded: 0,
      status: 'Queued',
      queue_position: 0,
      local_file: targetFile,
      part_file: partFile,
      created_at: Date.now()
    };

    activeDownloads.set(downloadId, transferEntry);
    saveTransfers();

    // Start background download stream
    startTransfer(transferEntry, 0);

    return sendJson(200, {
      ok: true,
      message: 'Download queued',
      id: downloadId
    });
  }

  // Pause / Abort Download
  if ((pathname === '/downloads/pause' || pathname === '/downloads/abort') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const entry = findDownload(body);
    if (!entry) {
      return sendJson(404, { ok: false, error: 'Transfer not found' });
    }
    const reqStatus = (body.status || 'Paused').toLowerCase();
    const isCancel = reqStatus === 'cancelled' || reqStatus === 'cancel';

    if (isCancel) {
      entry.userCancelled = true;
      entry.status = 'Cancelled';
      if (entry.downloadHandle && typeof entry.downloadHandle.cancel === 'function') {
        try {
          entry.downloadHandle.cancel('Cancelled by user');
        } catch (_) {}
      }
      entry.downloadHandle = null;
      if (entry.writeStream) {
        try { entry.writeStream.end(); } catch (_) {}
        entry.writeStream = null;
      }
      const partFile = entry.part_file || (entry.local_file ? entry.local_file + '.part' : '');
      if (partFile && fs.existsSync(partFile)) {
        try { fs.unlinkSync(partFile); } catch (_) {}
      }
      if (entry.local_file && fs.existsSync(entry.local_file) && entry.progress_pct < 100) {
        try { fs.unlinkSync(entry.local_file); } catch (_) {}
      }
      activeDownloads.delete(entry.id);
      saveTransfers();
      return sendJson(200, { ok: true, status: 'Cancelled', id: entry.id });
    }

    entry.userPaused = true;
    entry.status = 'Paused';
    entry.speed = 0;
    if (entry.downloadHandle && typeof entry.downloadHandle.cancel === 'function') {
      try {
        entry.downloadHandle.cancel('Paused by user');
      } catch (_) {}
    }
    entry.downloadHandle = null;
    if (entry.writeStream) {
      try { entry.writeStream.end(); } catch (_) {}
      entry.writeStream = null;
    }
    const partFile = entry.part_file || (entry.local_file ? entry.local_file + '.part' : '');
    if (partFile && fs.existsSync(partFile)) {
      try { entry.bytes_downloaded = fs.statSync(partFile).size; } catch (_) {}
    }
    saveTransfers();
    return sendJson(200, { ok: true, status: 'Paused', id: entry.id });
  }

  // Resume / Retry Download
  if ((pathname === '/downloads/resume' || pathname === '/downloads/retry') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    let entry = findDownload(body);

    if (!entry) {
      const username = body.username;
      const virtualPath = body.virtual_path;
      if (username && virtualPath) {
        const norm = virtualPath.replace(/\\/g, '/');
        const filename = path.basename(norm);
        const targetFile = path.join(DOWNLOADS_DIR, filename);
        const partFile = targetFile + '.part';
        const downloadId = `${username}:${virtualPath}`;
        entry = {
          id: downloadId,
          username,
          virtual_path: virtualPath,
          filename,
          size: body.size || 0,
          speed: 0,
          progress_pct: 0,
          bytes_downloaded: 0,
          status: 'Queued',
          queue_position: 0,
          local_file: targetFile,
          part_file: partFile,
          created_at: Date.now()
        };
        activeDownloads.set(downloadId, entry);
      } else {
        return sendJson(404, { ok: false, error: 'Transfer not found' });
      }
    }

    if (entry.downloadHandle && typeof entry.downloadHandle.cancel === 'function') {
      try {
        entry.downloadHandle.cancel('Restarting');
      } catch (_) {}
      entry.downloadHandle = null;
    }
    if (entry.writeStream) {
      try { entry.writeStream.end(); } catch (_) {}
      entry.writeStream = null;
    }

    let offset = 0;
    const partFile = entry.part_file || (entry.local_file ? entry.local_file + '.part' : '');
    if (fs.existsSync(partFile)) {
      try { offset = fs.statSync(partFile).size; } catch (_) {}
    } else if (fs.existsSync(entry.local_file)) {
      try { offset = fs.statSync(entry.local_file).size; } catch (_) {}
    }

    entry.status = 'Queued';
    saveTransfers();
    startTransfer(entry, offset);
    return sendJson(200, { ok: true, status: entry.status, id: entry.id, offset });
  }

  // Resume All Paused Downloads
  if (pathname === '/downloads/resume_all' && req.method === 'POST') {
    if (!isConnected || !slskClient) {
      return sendJson(503, { ok: false, error: 'Soulseek client is not connected' });
    }
    let resumedCount = 0;
    for (const entry of activeDownloads.values()) {
      if (entry.status === 'Paused' || entry.status.startsWith('Error')) {
        let offset = 0;
        const partFile = entry.part_file || (entry.local_file + '.part');
        if (fs.existsSync(partFile)) {
          try { offset = fs.statSync(partFile).size; } catch (_) {}
        }
        startTransfer(entry, offset);
        resumedCount++;
      }
    }
    saveTransfers();
    return sendJson(200, { ok: true, resumed: resumedCount });
  }

  // Pause All Active Downloads
  if (pathname === '/downloads/pause_all' && req.method === 'POST') {
    let pausedCount = 0;
    for (const entry of activeDownloads.values()) {
      if (entry.status === 'Transferring' || entry.status === 'Queued') {
        entry.userPaused = true;
        entry.status = 'Paused';
        entry.speed = 0;
        if (entry.downloadHandle && typeof entry.downloadHandle.cancel === 'function') {
          try { entry.downloadHandle.cancel('Paused by user'); } catch (_) {}
        }
        entry.downloadHandle = null;
        if (entry.writeStream) {
          try { entry.writeStream.end(); } catch (_) {}
          entry.writeStream = null;
        }
        const partFile = entry.part_file || (entry.local_file + '.part');
        if (fs.existsSync(partFile)) {
          try { entry.bytes_downloaded = fs.statSync(partFile).size; } catch (_) {}
        }
        pausedCount++;
      }
    }
    saveTransfers();
    return sendJson(200, { ok: true, paused: pausedCount });
  }

  // Cancel / Delete / Clear Download
  if ((pathname === '/downloads/cancel' || pathname === '/downloads/remove' || pathname === '/downloads/delete' || pathname === '/downloads/clear') && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const entry = findDownload(body);

    if (entry) {
      entry.userCancelled = true;
      if (entry.downloadHandle && typeof entry.downloadHandle.cancel === 'function') {
        try {
          entry.downloadHandle.cancel('Cancelled by user');
        } catch (_) {}
      }
      entry.downloadHandle = null;
      if (entry.writeStream) {
        try { entry.writeStream.end(); } catch (_) {}
        entry.writeStream = null;
      }
      const partFile = entry.part_file || (entry.local_file ? entry.local_file + '.part' : '');
      if (partFile && fs.existsSync(partFile)) {
        try { fs.unlinkSync(partFile); } catch (_) {}
      }
      if (entry.local_file && fs.existsSync(entry.local_file) && entry.progress_pct < 100) {
        try { fs.unlinkSync(entry.local_file); } catch (_) {}
      }
      activeDownloads.delete(entry.id);
      for (const [k, d] of activeDownloads.entries()) {
        if (d === entry || d.id === entry.id) activeDownloads.delete(k);
      }
    }
    if (body.id) {
      activeDownloads.delete(body.id);
    }
    if (body.username && body.virtual_path) {
      activeDownloads.delete(`${body.username}:${body.virtual_path}`);
    }
    if (body.virtual_path) {
      const bn = normPath(body.virtual_path);
      for (const [k, d] of activeDownloads.entries()) {
        if (normPath(d.virtual_path) === bn) activeDownloads.delete(k);
      }
    }

    saveTransfers();
    return sendJson(200, { ok: true, removed: true });
  }

  // Get Downloads / Transfers List
  if (pathname === '/downloads') {
    const list = Array.from(activeDownloads.values()).map(d => ({
      id: d.id,
      username: d.username,
      virtual_path: d.virtual_path,
      filename: d.filename,
      size: d.size,
      speed: d.speed,
      progress_pct: d.progress_pct,
      bytes_downloaded: d.bytes_downloaded || 0,
      status: d.status,
      queue_position: d.queue_position,
      local_file: d.local_file,
      part_file: d.part_file
    }));

    return sendJson(200, {
      items: list
    });
  }

  sendJson(404, { ok: false, error: 'Endpoint not found' });
});

function cleanupAndPersist() {
  console.log('[Soulseek] Persisting active downloads before shutdown...');
  for (const entry of activeDownloads.values()) {
    if (entry.writeStream) {
      try { entry.writeStream.end(); } catch (_) {}
      entry.writeStream = null;
    }
    if (entry.status === 'Transferring' || entry.status === 'Queued') {
      entry.status = 'Paused';
    }
    const partFile = entry.part_file || (entry.local_file ? entry.local_file + '.part' : '');
    if (partFile && fs.existsSync(partFile)) {
      try { entry.bytes_downloaded = fs.statSync(partFile).size; } catch (_) {}
    }
  }
  saveTransfers();
}

process.on('SIGINT', () => {
  cleanupAndPersist();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanupAndPersist();
  process.exit(0);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Soulseek] Standalone Node.js Soulseek microservice running on http://127.0.0.1:${PORT}`);
  loadTransfers();
});
