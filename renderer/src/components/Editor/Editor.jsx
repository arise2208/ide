import React, { useCallback, useEffect, useState, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styles from './Editor.module.css';

// Configure Monaco to use local files instead of CDN
loader.config({
  monaco,
  paths: {
    vs: '/monaco-editor/min/vs'
  }
});

// Provide worker URLs for Monaco so it doesn't try to fetch from CDN
// This must be set on window before Monaco initializes
if (typeof window !== 'undefined' && !window.MonacoEnvironment) {
  window.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        // map language label to appropriate worker script path
        let workerPath = '/monaco-editor/min/vs/editor/editor.worker.js'
        if (label === 'json') workerPath = '/monaco-editor/min/vs/language/json/json.worker.js'
        else if (label === 'css' || label === 'scss' || label === 'less') workerPath = '/monaco-editor/min/vs/language/css/css.worker.js'
        else if (label === 'html' || label === 'handlebars' || label === 'razor') workerPath = '/monaco-editor/min/vs/language/html/html.worker.js'
        else if (label === 'typescript' || label === 'javascript') workerPath = '/monaco-editor/min/vs/language/typescript/ts.worker.js'

        // Create a blob URL that imports the worker script to avoid dev-server HTML responses
        const script = `importScripts('${workerPath}');`
        return URL.createObjectURL(new Blob([script], { type: 'application/javascript' }))
    }
  }
}

// C++ language configuration
const CPP_CONFIG = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/']
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" }
  ],
  folding: {
    markers: {
      start: new RegExp('^\\s*#pragma\\s+region\\b'),
      end: new RegExp('^\\s*#pragma\\s+endregion\\b')
    }
  }
};

// Spinning save icon component
const SaveIcon = () => (
  <svg 
    className={styles.saveIcon}
    width="14" 
    height="14" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2"
  >
    <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
  </svg>
);

const MonacoEditor = ({ 
  filePath, 
  initialValue = '', 
  onChange,
  onSave,
  compileErrors = null
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const saveTimeoutRef = useRef(null);
  const editorRef = useRef(null);
  
  // Auto-save functionality
  const autoSave = useCallback((editor) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      handleSave(editor);
    }, 1000); // Auto-save 1 second after last change
  }, []);
  
  // Handle editor mount
  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    try {
      // Configure C++ language
      monaco.languages.setLanguageConfiguration('cpp', CPP_CONFIG);

      // Add Ctrl+S / Cmd+S handler
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          console.log('Save command triggered, filePath:', filePath);
          handleSave(editor);
        }
      );

      // Set up auto-save on content change
      editor.onDidChangeModelContent(() => {
        if (filePath) {  // Only auto-save if we have a file path
          autoSave(editor);
        }
      });

      // Set initial model path
      if (filePath) {
        const model = editor.getModel();
        if (model) {
          monaco.editor.setModelLanguage(model, 'cpp');
          model.updateOptions({ tabSize: 4, insertSpaces: true });
        }
      }
    } catch (err) {
      console.error('Editor mount error:', err);
      setError('Failed to initialize editor: ' + err.message);
    }
  }, [autoSave, filePath]);

  // Handle file saving
  const handleSave = useCallback(async (editor) => {
    if (!editor || !filePath) {
      console.warn('Save aborted: missing editor or filePath', { editor: !!editor, filePath });
      return;
    }

    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      setSaving(true);
      setError(null);
      const content = editor.getValue();
      console.log('Saving file:', { filePath, contentLength: content.length });
      
      const response = await window.api.writeFile({
        filePath: filePath,
        content: content
      });
      console.log('Save response:', response);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to save file');
      }
      
      if (onSave) {
        onSave(content);
      }
      console.log('File saved successfully');
    } catch (err) {
      const errorMsg = `Failed to save ${filePath}: ${err.message}`;
      setError(errorMsg);
      console.error('Save error:', err);
      throw err; // Re-throw to trigger error UI
    } finally {
      setSaving(false);
    }
  }, [filePath, onSave]);

  if (!filePath) {
    return (
      <div className={styles.placeholder}>
        Select a .cpp file to start editing
      </div>
    );
  }

  return (
    <div className={styles.editorContainer}>
      <Editor
        height="calc(100% - 24px)"
        defaultLanguage="cpp"
        path={filePath}
        value={initialValue}
        onChange={onChange}
        onMount={handleEditorDidMount}
        loading={<div className={styles.loading}>Loading editor...</div>}
        options={{
          fontSize: 14,
          fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          rulers: [80],
          wordWrap: 'on',
          wrappingStrategy: 'advanced',
          formatOnPaste: true,
          formatOnType: true,
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
        }}
      />
      {(saving || error) && (
        <div className={`${styles.statusBar} ${error ? styles.error : ''}`}>
          {saving && <SaveIcon />}
          {saving ? 'Saving...' : error}
        </div>
      )}
      {compileErrors && (
        <div className={styles.compileErrors}>
          {compileErrors.split('\n').map((err, i) => (
            <div key={i} className={styles.compileError}>{err}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MonacoEditor;