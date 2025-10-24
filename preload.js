const { contextBridge, ipcRenderer } = require('electron')

// Channels we allow to be used
const validChannels = [
  'file:read',
  'file:write',
  'file:list',
  'dialog:openFolder',
  'tests:load',
  'tests:save'
  , 'compile-run-tests'
  , 'cc:imported'
  , 'cc:received'
  , 'cc:create'
  , 'cc:check'
  , 'set:targetFolder'
]

// Validate channel for security
function validateChannel(channel) {
  if (!validChannels.includes(channel)) {
    throw new Error(`Invalid channel: ${channel}`)
  }
}

// Expose protected API to renderer
contextBridge.exposeInMainWorld('api', {
  // Read file contents
  readFile: async (filePath) => {
    validateChannel('file:read')
    return await ipcRenderer.invoke('file:read', filePath)
  },

  // Write content to file
  writeFile: async (args) => {
    validateChannel('file:write')
    if (typeof args !== 'object' || !args.filePath || !args.content) {
      throw new Error('Invalid arguments: requires {filePath, content}')
    }
    return await ipcRenderer.invoke('file:write', args)
  },

  // List directory contents with recursive tree
  listFiles: async (dirPath) => {
    validateChannel('file:list')
    return await ipcRenderer.invoke('file:list', dirPath)
  },

  // Open folder dialog and return file tree
  openFolder: async () => {
    validateChannel('dialog:openFolder')
    return await ipcRenderer.invoke('dialog:openFolder')
  }
  ,

  // Load test cases for a source file
  loadTests: async (filePath) => {
    validateChannel('tests:load')
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new Error('Invalid filePath')
    }
    return await ipcRenderer.invoke('tests:load', filePath)
  },

  // Save test cases for a source file
  saveTests: async (filePath, tests) => {
    validateChannel('tests:save')
    if (typeof filePath !== 'string' || !Array.isArray(tests)) {
      throw new Error('Invalid arguments for saveTests')
    }
    return await ipcRenderer.invoke('tests:save', { filePath, tests })
  }
  ,
  // Compile and run tests using g++ and return results
  compileRunTests: async (sourceFilePath, tests) => {
    validateChannel('compile-run-tests')
    if (typeof sourceFilePath !== 'string' || !Array.isArray(tests)) {
      throw new Error('Invalid arguments for compileRunTests')
    }
    return await ipcRenderer.invoke('compile-run-tests', { sourceFilePath, tests })
  }
  ,
  // Listen for Competitive Companion imports (sent by main process)
  onCompanionImported: (cb) => {
    if (typeof cb !== 'function') return
    ipcRenderer.on('cc:imported', (_event, data) => cb(data))
  }
  ,
  // Listen for received (not-yet-created) payloads so the renderer can prompt the user
  onCompanionReceived: (cb) => {
    if (typeof cb !== 'function') return
    ipcRenderer.on('cc:received', (_event, data) => cb(data))
  }
  ,
  // Ask main to create files for a previously-received payload (user accepted)
  createImport: async (payload) => {
    validateChannel('cc:create')
    return await ipcRenderer.invoke('cc:create', { payload })
  }
  ,
  // Check whether an import payload's suggested filename already exists in the target folder
  checkImportExists: async (payload) => {
    validateChannel('cc:check')
    return await ipcRenderer.invoke('cc:check', { payload })
  }
  ,
  // Let renderer set a preferred target folder inside the opened project
  setTargetFolder: async (folderPath) => {
    validateChannel('set:targetFolder')
    return await ipcRenderer.invoke('set:targetFolder', folderPath)
  }
})
