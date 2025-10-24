import React, { useState, useCallback, useEffect } from 'react'
import { FileTree } from './components/FileTree'
import { Editor } from './components/Editor'
import { TestsPane } from './components/TestsPane'
import { ResizablePanel } from './components/ResizablePanel'

export default function App() {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState(null)
  const [rootPath, setRootPath] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [openFiles, setOpenFiles] = useState([])
  const [fileContents, setFileContents] = useState({})
  const [importedProblem, setImportedProblem] = useState(null)
  const [pendingImport, setPendingImport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [compileError, setCompileError] = useState(null)

  const handleOpenFolder = useCallback(async () => {
    const response = await window.api.openFolder()
    if (response.success) {
      setFiles(response.data.files)
      if (response.data && response.data.rootPath) setRootPath(response.data.rootPath)
    }
  }, [])

  const handleRefreshFiles = useCallback(async () => {
    if (!rootPath) return;
    const response = await window.api.listFiles(rootPath);
    if (response.success) {
      setFiles(response.data);
    }
  }, [rootPath])

  // Listen for Competitive Companion payloads (received but not created)
  useEffect(() => {
    if (!window.api || typeof window.api.onCompanionReceived !== 'function') return

    const handler = async (data) => {
      try {
        // First check with main process whether this suggested file already exists
        if (window.api && typeof window.api.checkImportExists === 'function') {
          const check = await window.api.checkImportExists(data.payload)
          if (check && check.success && check.exists && check.path) {
            // Open the existing file so user notices it and do not prompt to create
            try {
              await handleFileSelect(check.path)
            } catch (e) {
              // ignore open errors, but still avoid creating
            }
            return
          }
        }

        // show prompt to accept/reject the import
        setPendingImport(data)
      } catch (e) {
        // fallback to prompting if check fails
        setPendingImport(data)
      }
    }

    window.api.onCompanionReceived(handler)
  }, [])

  const handleFileSelect = useCallback(async (path) => {
    try {
      setLoading(true);
      setError(null);

      if (!openFiles.includes(path)) {
        const response = await window.api.readFile(path);
        if (!response.success) {
          throw new Error(response.error || 'Failed to read file');
        }

        setOpenFiles(prev => [...prev, path]);
        setFileContents(prev => ({ ...prev, [path]: response.data }));
      }

      setSelectedFile(path);
      setValue(fileContents[path] || '');

      try {
        const normalized = String(path).replace(/\\/g, '/')
        const idx = normalized.lastIndexOf('/')
        const dir = idx !== -1 ? normalized.slice(0, idx) : '.'
        await window.api.setTargetFolder(dir)
      } catch (e) {
      }
      console.log('File loaded:', path);
    } catch (err) {
      setError(err.message);
      console.error('Error loading file:', err);
    } finally {
      setLoading(false);
    }
  }, [openFiles, fileContents])

  const handleCloseTab = useCallback((path) => {
    setOpenFiles(prev => {
      const newOpenFiles = prev.filter(f => f !== path);
      if (selectedFile === path && newOpenFiles.length > 0) {
        const newSelected = newOpenFiles[newOpenFiles.length - 1];
        setSelectedFile(newSelected);
        setValue(fileContents[newSelected] || '');
      } else if (newOpenFiles.length === 0) {
        setSelectedFile(null);
        setValue('');
      }
      return newOpenFiles;
    });

    setFileContents(prev => {
      const newContents = { ...prev };
      delete newContents[path];
      return newContents;
    });
  }, [selectedFile, fileContents])

  const handleEditorChange = useCallback((newValue) => {
    setValue(newValue);
    if (selectedFile) {
      setFileContents(prev => ({ ...prev, [selectedFile]: newValue }));
    }
  }, [selectedFile])

  const openImported = useCallback(async () => {
    // This function is no longer used for pre-created imports
    return
  }, [importedProblem, handleFileSelect])

  useEffect(() => {
    if (!pendingImport) return
    const t = setTimeout(() => setPendingImport(null), 30000)
    return () => clearTimeout(t)
  }, [pendingImport])

  return (
    <div className="app">
      <header className="header">
        <span>Competitive Programming IDE</span>
        <button onClick={handleOpenFolder}>Open Folder</button>
      </header>
      <div className="main">
        <div className="main-content">
          <ResizablePanel
            defaultSize={280}
            minSize={180}
            maxSize={500}
            direction="horizontal"
            className="sidebar"
          >
            <div className="sidebar-header">
              <span className="sidebar-title">EXPLORER</span>
            </div>
            <div className="sidebar-content">
              {files && (
                <FileTree
                  files={files}
                  onSelect={handleFileSelect}
                  selectedPath={selectedFile}
                  onRefresh={handleRefreshFiles}
                />
              )}
            </div>
          </ResizablePanel>

          <div className="editor-container">
            {openFiles.length > 0 && (
              <div className="tabs">
                {openFiles.map(filePath => {
                  const fileName = filePath.split('/').pop();
                  return (
                    <div
                      key={filePath}
                      className={`tab ${selectedFile === filePath ? 'tab-active' : ''}`}
                      onClick={() => {
                        setSelectedFile(filePath);
                        setValue(fileContents[filePath] || '');
                      }}
                    >
                      <span>{fileName}</span>
                      <button
                        className="tab-close"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseTab(filePath);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="editor">
              <Editor
                key={selectedFile}
                filePath={selectedFile}
                initialValue={value}
                onChange={handleEditorChange}
                onSave={async (content) => {
                  if (!selectedFile) {
                    setError('No file selected');
                    return;
                  }

                  try {
                    setError(null);
                    console.log('Saving file in App:', selectedFile);

                    const response = await window.api.writeFile({
                      filePath: selectedFile,
                      content: content
                    });

                    console.log('Save response in App:', response);

                    if (!response.success) {
                      throw new Error(response.error || 'Failed to save file');
                    }

                    const verifyResponse = await window.api.readFile(selectedFile);
                    if (!verifyResponse.success || verifyResponse.data !== content) {
                      throw new Error('File verification failed');
                    }

                    console.log('File saved and verified successfully:', selectedFile);
                  } catch (err) {
                    const errorMsg = `Failed to save ${selectedFile}: ${err.message}`;
                    console.error(errorMsg);
                    setError(errorMsg);
                    throw err;
                  }
                }}
              />
            </div>

            {compileError && (
              <div className="compilation-error">
                <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>Compilation Error:</div>
                {compileError}
              </div>
            )}

          </div>

          <ResizablePanel
            defaultSize={360}
            minSize={280}
            maxSize={800}
            direction="horizontal"
            className="tests-panel"
          >
            <TestsPane
              filePath={selectedFile}
              onCompileError={setCompileError}
            />
          </ResizablePanel>
        </div>
      </div>

      {/* Pending import toast (prompt user to accept/reject) */}
      {pendingImport && (
        <div style={{
          position: 'fixed',
          left: 24,
          bottom: 24,
          background: '#1f1f1f',
          color: '#e6e6e6',
          padding: '12px 16px',
          borderRadius: 6,
          boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 320
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{pendingImport.title || (pendingImport.payload && (pendingImport.payload.name || pendingImport.payload.title)) || 'Imported problem'}</div>
            <div style={{ fontSize: 12, color: '#aaa' }}>{pendingImport.suggestedFilename || (pendingImport.payload && (pendingImport.payload.filename || pendingImport.payload.file)) || ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={async () => {
              // Accept import: ask main to create files
              try {
                setLoading(true)
                const resp = await window.api.createImport(pendingImport.payload)
                setLoading(false)
                if (!resp || !resp.success) {
                  throw new Error(resp?.error || 'Failed to create files')
                }
                // refresh file tree
                if (rootPath) {
                  const r = await window.api.listFiles(rootPath)
                  if (r.success) setFiles(r.data)
                }
                // open the created cpp file
                if (resp.cpp) await handleFileSelect(resp.cpp)
                setPendingImport(null)
              } catch (e) {
                setLoading(false)
                setError(e.message)
              }
            }} style={{ padding: '6px 10px', cursor: 'pointer' }}>Accept</button>
            <button onClick={() => setPendingImport(null)} style={{ padding: '6px 10px', cursor: 'pointer' }}>Reject</button>
          </div>
        </div>
      )}

      {error && (
        <div className="error-message" style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#e51400',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '4px',
          zIndex: 1000
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
