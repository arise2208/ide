const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const http = require('http')

// Validate file paths for security
function isPathSafe(filePath) {
  const normalizedPath = path.normalize(filePath)
  // Add your workspace root path validation here
  return !normalizedPath.includes('..')
}

// Get tests file path for a given source file
// Get tests file path for a given source file
function getTestsFilePath(sourcePath) {
  // Example: /path/to/main.cpp -> /path/to/main.json
  const parsed = path.parse(sourcePath)
  const dir = parsed.dir
  const name = parsed.name // filename without extension
  return path.join(dir, `${name}.json`)
}

// Keep track of the currently opened project root (set when user opens a folder)
let selectedProjectRoot = null
// Optionally track a currently-selected folder inside the project (set by renderer when user selects a file/folder)
let currentTargetFolder = null

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'problem'
}

function startCompetitiveCompanionServer(port = 12345) {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(404)
      return res.end('Not found')
    }

    let body = ''
    req.on('data', chunk => { body += chunk.toString() })
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}')
        const title = data.name || data.title || data.problemtitle || 'problem'
        const samples = data.samples || data.tests || []

        // Do not create files yet. Instead notify renderer and let the user accept/reject.
        try {
          const wins = BrowserWindow.getAllWindows() || []
          wins.forEach(w => {
            try {
              w.webContents.send('cc:received', {
                payload: data,
                title,
                samples,
                suggestedFilename: (data.filename || data.file || data.name || title || 'problem')
              })
            } catch (e) {}
          })
        } catch (e) {}

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, info: 'received' }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: err.message }))
      }
    })
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`Competitive Companion listener running on http://127.0.0.1:${port}`)
  })
}

// Load or create empty tests file
async function loadOrCreateTests(filePath) {
  const testsPath = getTestsFilePath(filePath)
  try {
    const content = await fs.readFile(testsPath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    // If the file doesn't exist, create it with an empty array and return []
    try {
      const empty = []
      await fs.writeFile(testsPath, JSON.stringify(empty, null, 2), 'utf8')
      console.log(`Created tests file: ${testsPath}`)
      return empty
    } catch (writeErr) {
      console.error(`Failed to create tests file ${testsPath}:`, writeErr)
      // Fall back to returning empty array so UI can continue
      return []
    }
  }
}

// Save tests to file
async function saveTests(filePath, tests) {
  const testsPath = getTestsFilePath(filePath)
  await fs.writeFile(testsPath, JSON.stringify(tests, null, 2), 'utf8')
}

// Recursively scan directory and get file tree
async function getFileTree(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const files = await Promise.all(
      entries.map(async entry => {
        const fullPath = path.join(dirPath, entry.name)
        const isDir = entry.isDirectory()
        
        // Get file stats for additional metadata
        const stats = await fs.stat(fullPath)
        
        const baseData = {
          name: entry.name,
          path: fullPath,
          isDir,
          size: stats.size,
          modifiedTime: stats.mtime,
          createdTime: stats.birthtime,
        }

        if (isDir) {
          // Recursively scan subdirectories
          const children = await getFileTree(fullPath)
          return { ...baseData, children }
        }
        
        return baseData
      })
    )

    // Sort: directories first, then files, both alphabetically
    return files.sort((a, b) => {
      if (a.isDir === b.isDir) {
        return a.name.localeCompare(b.name)
      }
      return a.isDir ? -1 : 1
    })
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error)
    throw error
  }
}

// IPC Handlers
async function setupIpcHandlers() {
  // Read file contents
  ipcMain.handle('file:read', async (_, filePath) => {
    try {
      if (!isPathSafe(filePath)) {
        throw new Error('Invalid path')
      }
      const content = await fs.readFile(filePath, 'utf8')
      return { success: true, data: content }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Write to file
  ipcMain.handle('file:write', async (_, args) => {
    try {
      // Handle both string path + content args, and object arg formats
      let filePath, content;
      if (typeof args === 'object' && args !== null) {
        ({ filePath, content } = args);
      } else {
        throw new Error('Invalid arguments passed to file:write');
      }

      if (!filePath || typeof filePath !== 'string') {
        throw new Error('No valid file path provided');
      }

      if (!isPathSafe(filePath)) {
        throw new Error(`Invalid path: ${filePath}`);
      }

      // Ensure the file's directory exists
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });

      // Write the file with a temporary backup approach
      const backupPath = `${filePath}.bak`;
      
      // If file exists, create backup first
      if (await fs.access(filePath).then(() => true).catch(() => false)) {
        await fs.copyFile(filePath, backupPath);
      }

      // Write new content
      await fs.writeFile(filePath, content, 'utf8');
      
      // Verify the write
      const written = await fs.readFile(filePath, 'utf8');
      if (written !== content) {
        throw new Error('File verification failed');
      }

      // Remove backup if everything succeeded
      if (await fs.access(backupPath).then(() => true).catch(() => false)) {
        await fs.unlink(backupPath);
      }

      console.log(`File saved successfully: ${filePath}`);
      return { success: true };
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error);
      return { 
        success: false, 
        error: error.message,
        details: {
          code: error.code,
          path: filePath,
          contentLength: content?.length
        }
      };
    }
  })

  // List directory contents with recursive tree
  ipcMain.handle('file:list', async (_, dirPath) => {
    try {
      if (!isPathSafe(dirPath)) {
        throw new Error('Invalid path')
      }
      const fileTree = await getFileTree(dirPath)
      return { success: true, data: fileTree }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Load test cases for a file
  ipcMain.handle('tests:load', async (_, filePath) => {
    try {
      if (!isPathSafe(filePath)) {
        throw new Error('Invalid path')
      }
      const tests = await loadOrCreateTests(filePath)
      return { success: true, data: tests }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Save test cases for a file
  ipcMain.handle('tests:save', async (_, { filePath, tests }) => {
    try {
      if (!isPathSafe(filePath)) {
        throw new Error('Invalid path')
      }
      await saveTests(filePath, tests)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Open folder dialog and return file tree
  ipcMain.handle('dialog:openFolder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Folder',
        buttonLabel: 'Open Folder',
      })

      if (result.canceled) {
        return { success: true, data: null }
      }

      const selectedPath = result.filePaths[0]
  // remember opened project root for Competitive Companion imports
  selectedProjectRoot = selectedPath
      const fileTree = await getFileTree(selectedPath)

      return {
        success: true,
        data: {
          rootPath: selectedPath,
          files: fileTree
        }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Create new file
  ipcMain.handle('file:create', async (_, { filePath, isDirectory }) => {
    try {
      if (!isPathSafe(filePath)) {
        throw new Error('Invalid path')
      }

      if (isDirectory) {
        await fs.mkdir(filePath, { recursive: true })
      } else {
        const dirPath = path.dirname(filePath)
        await fs.mkdir(dirPath, { recursive: true })
        await fs.writeFile(filePath, '', 'utf8')
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Delete file or folder
  ipcMain.handle('file:delete', async (_, filePath) => {
    try {
      if (!isPathSafe(filePath)) {
        throw new Error('Invalid path')
      }

      const stats = await fs.stat(filePath)
      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true })
      } else {
        await fs.unlink(filePath)
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Rename file or folder
  ipcMain.handle('file:rename', async (_, { oldPath, newPath }) => {
    try {
      if (!isPathSafe(oldPath) || !isPathSafe(newPath)) {
        throw new Error('Invalid path')
      }

      await fs.rename(oldPath, newPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Cut (move) file or folder
  ipcMain.handle('file:cut', async (_, { sourcePath, destPath }) => {
    try {
      if (!isPathSafe(sourcePath) || !isPathSafe(destPath)) {
        throw new Error('Invalid path')
      }

      await fs.rename(sourcePath, destPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Allow renderer to set a target folder inside the project (so imports land in the same folder)
  ipcMain.handle('set:targetFolder', async (_, folderPath) => {
    try {
      if (!folderPath || typeof folderPath !== 'string') throw new Error('Invalid folder')
      // Basic safety: ensure the folder is under the selected project root
      if (selectedProjectRoot && !path.normalize(folderPath).startsWith(path.normalize(selectedProjectRoot))) {
        throw new Error('Target folder must be inside the opened project')
      }
      currentTargetFolder = folderPath
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Compile and run tests
  const { spawn } = require('child_process')
  const os = require('os')

  // Create files for a previously-received Competitive Companion payload (called by renderer when user accepts)
  ipcMain.handle('cc:create', async (_, { payload }) => {
    try {
      const data = payload || {}
      const title = data.name || data.title || data.problemtitle || 'problem'
      const samples = data.samples || data.tests || []

      if (!selectedProjectRoot) {
        throw new Error('Open a project folder first')
      }

      const targetDir = data.dir ? path.join(selectedProjectRoot, data.dir) : (currentTargetFolder || selectedProjectRoot)
      await fs.mkdir(targetDir, { recursive: true })

      const requestedName = (data.filename || data.file || data.name || title || 'problem')
      const base = slugify(requestedName)

      const desiredCpp = path.join(targetDir, `${base}.cpp`)
      let cppName = desiredCpp
      const exists = await fs.access(desiredCpp).then(() => true).catch(() => false)
      let createdNew = false
      if (!exists) {
        // create the file if it doesn't exist
        const template = `// ${title}\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  ios::sync_with_stdio(false);\n  cin.tie(nullptr);\n  return 0;\n}\n`
        await fs.writeFile(cppName, template, 'utf8')
        createdNew = true
      } else {
        // use existing file; do not create duplicates
        cppName = desiredCpp
      }

      const tests = (Array.isArray(samples) ? samples : []).map((s, idx) => ({
        id: `test-${idx + 1}`,
        name: `Sample ${idx + 1}`,
        input: s.input || s.in || '',
        expected: s.output || s.out || ''
      }))

      const testsBase = path.parse(cppName).name
      const testsPath = path.join(targetDir, `${testsBase}.json`)
      const testsExists = await fs.access(testsPath).then(() => true).catch(() => false)
      if (!testsExists) {
        await fs.writeFile(testsPath, JSON.stringify(tests, null, 2), 'utf8')
      }

      // Notify renderer windows that import completed
      try {
        const wins = BrowserWindow.getAllWindows() || []
        wins.forEach(w => {
          try { w.webContents.send('cc:imported', { path: targetDir, title, tests, cpp: cppName, testsPath }) } catch (e) {}
        })
      } catch (e) {}

      return { success: true, cpp: cppName, testsPath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Check whether an incoming Competitive Companion payload would collide with an existing file
  ipcMain.handle('cc:check', async (_, { payload }) => {
    try {
      const data = payload || {}
      const title = data.name || data.title || data.problemtitle || 'problem'
      if (!selectedProjectRoot) {
        return { success: false, error: 'Open a project folder first' }
      }

      const targetDir = data.dir ? path.join(selectedProjectRoot, data.dir) : (currentTargetFolder || selectedProjectRoot)
      const requestedName = (data.filename || data.file || data.name || title || 'problem')
      const base = slugify(requestedName)
      const desiredCpp = path.join(targetDir, `${base}.cpp`)
      const exists = await fs.access(desiredCpp).then(() => true).catch(() => false)
      return { success: true, exists, path: desiredCpp }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('compile-run-tests', async (_, { sourceFilePath, tests }) => {
    try {
      console.log('compile-run-tests invoked for', sourceFilePath, 'with', tests && tests.length, 'tests')
      if (!isPathSafe(sourceFilePath)) throw new Error('Invalid source path')
      if (!Array.isArray(tests)) throw new Error('Invalid tests array')

      const workDir = path.dirname(sourceFilePath)
      const binName = `tempBinary${process.pid}${Date.now()}`
      const binPath = path.join(os.tmpdir(), binName)

      // Compile with g++
      console.log('Starting compilation...')
      await new Promise((resolve, reject) => {
        const compile = spawn('g++', ['-std=c++17', '-O2', '-o', binPath, sourceFilePath], { cwd: workDir })
        let stderr = ''
        compile.stderr.on('data', chunk => { stderr += chunk.toString() })
        compile.on('close', code => {
          console.log('Compilation finished with code', code)
          if (stderr) console.log('Compiler stderr:', stderr)
          if (code === 0) return resolve()
          return reject(new Error(`Compile failed: ${stderr || ('exit code ' + code)}`))
        })
        compile.on('error', err => reject(err))
      })

      console.log('Compilation succeeded, running tests...')

      const results = []
      // Run each test with timeout
      for (const t of tests) {
        const name = t.name || 'unnamed'
        const id = t.id || null
        try {
          const output = await new Promise((resolve, reject) => {
            const proc = spawn(binPath, [], { cwd: workDir })
            let stdout = ''
            let stderr = ''
            let finished = false

            const timer = setTimeout(() => {
              if (finished) return
              finished = true
              proc.kill('SIGKILL')
              reject(new Error('Timeout'))
            }, 2000)

            proc.stdout.on('data', d => { stdout += d.toString() })
            proc.stderr.on('data', d => { stderr += d.toString() })
            proc.on('error', err => {
              if (finished) return
              finished = true
              clearTimeout(timer)
              reject(err)
            })
            proc.on('close', code => {
              if (finished) return
              finished = true
              clearTimeout(timer)
              if (code !== 0 && stderr) {
                // treat non-zero as error but still capture output
                console.log(`Test ${name} exited code ${code}, stderr:`, stderr)
                return resolve({ stdout, stderr, code })
              }
              console.log(`Test ${name} exited code ${code}`)
              return resolve({ stdout, stderr, code })
            })

            // Write input and close stdin
            if (typeof t.input === 'string') {
              proc.stdin.write(t.input)
            }
            try { proc.stdin.end() } catch (e) {}
          })

          const expected = (t.expected || '').replace(/\r\n/g, '\n')
          const got = (output.stdout || '').replace(/\r\n/g, '\n')
          const passed = got.trim() === expected.trim()

          console.log(`Test result for ${name}: passed=${passed}, got='${got}', expected='${expected}'`)

          results.push({ id, name, passed, output: got, expected, error: output.stderr || null })
        } catch (err) {
          console.error('Error running test', name, err)
          results.push({ id, name, passed: false, output: '', expected: t.expected || '', error: err.message })
        }
      }

      // Cleanup binary
      try { await fs.unlink(binPath).catch(() => {}) } catch (e) {}

      return { success: true, data: results }
    } catch (error) {
      console.error('compile-run-tests error:', error)
      return { success: false, error: error.message }
    }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true
    },
  })
  
  // Set CSP in the main process
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob:",
      "connect-src 'self' ws: wss: data: blob:",
      "worker-src 'self' blob: data:"
    ].join('; ')

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  const devUrl = 'http://localhost:5173'
  if (process.env.NODE_ENV === 'production') {
    win.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'))
  } else {
    win.loadURL(devUrl)
    win.webContents.openDevTools()
  }
}

app.whenReady().then(async () => {
  await setupIpcHandlers()
  try {
    const port = process.env.CC_PORT ? parseInt(process.env.CC_PORT, 10) : 12345
    startCompetitiveCompanionServer(port)
  } catch (e) {
    console.error('Failed to start Competitive Companion listener:', e)
  }
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
