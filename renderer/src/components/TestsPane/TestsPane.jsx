import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './TestsPane.module.css';

const TestCard = ({ test, onFieldChange, onRun, onDelete, result, running, testNumber, expanded, onToggleExpand }) => {
  const isCompact = !expanded

  if ((isCompact && !result?.error) || running) {
    return (
      <div className={`${styles.testItem} ${styles.compactRow}`} onClick={() => !running && onToggleExpand(test.id)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {running ? (
              <span style={{ fontSize: 16 }}>⏳</span>
            ) : result ? (
              <span style={{ fontSize: 16 }}>{result.passed ? '✅' : '❌'}</span>
            ) : (
              <span style={{ fontSize: 16 }}>◯</span>
            )}
            <div style={{ fontWeight: 600 }}>{`Test case - ${testNumber}`}</div>
            <div style={{ color: '#999', marginLeft: 8 }}>
              {running ? 'Running...' : (result && result.passed ? 'passed' : result ? 'failed' : '')}
            </div>
          </div>
          <div className={styles.controls}>
            <button className={styles.button} onClick={(e) => { e.stopPropagation(); onRun(test); }}>
              Run
            </button>
            <button className={`${styles.button} ${styles.delete}`} onClick={(e) => { e.stopPropagation(); onDelete(test.id); }}>
              Delete
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Expanded view (failed or manually expanded)
  return (
    <div className={styles.testItem}>
      <div className={styles.testHeader}>
        <input
          className={styles.input}
          value={test.name}
          readOnly
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {result ? (
            <span style={{ fontSize: 16 }}>{result.passed ? '✅' : '❌'}</span>
          ) : null}
          <div className={styles.controls}>
            <button className={styles.button} onClick={(e) => { e.stopPropagation(); onRun(test); }}>
              Run
            </button>
            <button className={`${styles.button} ${styles.delete}`} onClick={(e) => { e.stopPropagation(); onDelete(test.id); }}>
              Delete
            </button>
            <button className={styles.button} onClick={(e) => { e.stopPropagation(); onToggleExpand(test.id); }}>
              Hide
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className={styles.label}>Input</label>
        <textarea
          className={styles.input}
          value={test.input}
          onChange={(e) => onFieldChange(test.id, 'input', e.target.value)}
        />

        <label className={styles.label}>Expected</label>
        <textarea
          className={styles.input}
          value={test.expected}
          onChange={(e) => onFieldChange(test.id, 'expected', e.target.value)}
        />

        {result ? (
          <div style={{ marginTop: 8, background: '#111', padding: 8, borderRadius: 4, maxHeight: 300, overflowY: 'auto' }}>
            <div style={{ fontSize: 12, color: '#ccc' }}>Output:</div>
            <pre style={{ whiteSpace: 'pre-wrap', color: '#e6e6e6', margin: 0 }}>{result.output}</pre>
            {result.error ? (
              <div style={{ color: '#ff8080', marginTop: 8 }}>Error: {result.error}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
};

const TestsPane = ({ filePath, onCompileError }) => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [results, setResults] = useState({});
  const [runningTests, setRunningTests] = useState({});
  const [expandedTests, setExpandedTests] = useState({});
  const saveDebounceRef = useRef(null);
  const nextIdRef = useRef(1);

  // Load tests
  const loadTests = useCallback(async () => {
    if (!filePath) return;

    try {
      setLoading(true);
      setError(null);
      if (!window.api || typeof window.api.loadTests !== 'function') {
        throw new Error('API not available')
      }
      const response = await window.api.loadTests(filePath);

      if (!response.success) {
        throw new Error(response.error || 'Failed to load tests');
      }

      const loaded = response.data.map((test, index) => ({
        id: test.id || `test-${index + 1}`,
        name: test.name || `Test ${index + 1}`,
        input: test.input || '',
        expected: test.expected || ''
      }));

      setTests(loaded);
      nextIdRef.current = loaded.length + 1;
    } catch (err) {
      setError(err.message);
      console.error('Error loading tests:', err);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  // Save tests (debounced)
  const scheduleSave = useCallback((updatedTests) => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(async () => {
      try {
        if (!filePath) return;
        if (!window.api || typeof window.api.saveTests !== 'function') {
          throw new Error('API not available')
        }
        const toSave = updatedTests.map(({ id, ...rest }) => rest);
        const response = await window.api.saveTests(filePath, toSave);
        if (!response.success) throw new Error(response.error || 'Failed to save tests');
      } catch (err) {
        setError(err.message);
        console.error('Error saving tests:', err);
      }
    }, 700);
  }, [filePath]);

  // Handlers
  const handleAdd = useCallback(() => {
    const id = `test-${nextIdRef.current++}`;
    const newTest = { id, name: `Test ${id.replace('test-', '')}`, input: '', expected: '' };
    const updated = [...tests, newTest];
    setTests(updated);
    scheduleSave(updated);
    nextIdRef.current = updated.length + 1;
  }, [tests, scheduleSave]);

  const handleFieldChange = useCallback((id, field, value) => {
    const updated = tests.map(t => t.id === id ? { ...t, [field]: value } : t);
    setTests(updated);
    scheduleSave(updated);
  }, [tests, scheduleSave]);

  const handleDelete = useCallback((id) => {
    // Remove the test and reindex remaining tests sequentially
    const filtered = tests.filter(t => t.id !== id);
    const reindexed = filtered.map((t, idx) => ({
      id: `test-${idx + 1}`,
      name: `Test ${idx + 1}`,
      input: t.input,
      expected: t.expected
    }));
    setTests(reindexed);
    scheduleSave(reindexed);
    nextIdRef.current = reindexed.length + 1;
  }, [tests, scheduleSave]);

  const handleRun = useCallback(async (test) => {
    if (!filePath) return;
    if (!window.api || typeof window.api.compileRunTests !== 'function') {
      setError('Run not available')
      return;
    }
    setError(null)
    try {
      // mark running and collapse
      setRunningTests(prev => ({ ...prev, [test.id]: true }))
      setExpandedTests(prev => {
        const copy = { ...prev }
        delete copy[test.id]  // Collapse the running test
        return copy
      })

      const resp = await window.api.compileRunTests(filePath, [{ id: test.id, name: test.name, input: test.input, expected: test.expected }])
      if (!resp.success) {
        // Check if it's a compilation error
        if (resp.error && resp.error.includes('error')) {
          onCompileError?.(resp.error);
          throw new Error('Compilation failed');
        }
        throw new Error(resp.error || 'Run failed')
      }
      
      // Clear any previous compile errors
      onCompileError?.(null);
      
      const r = resp.data[0]
      setResults(prev => ({ ...prev, [test.id]: r }))
      
      // Expand if failed
      if (!r.passed) {
        setExpandedTests(prev => ({ ...prev, [test.id]: true }))
      }
    } catch (err) {
      setError(err.message)
      console.error('Error running test:', err)
      // Expand on error
      setExpandedTests(prev => ({ ...prev, [test.id]: true }))
    } finally {
      setRunningTests(prev => {
        const copy = { ...prev }
        delete copy[test.id]
        return copy
      })
    }
  }, [filePath]);

  const toggleExpand = useCallback((id) => {
    setExpandedTests(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleRunAll = useCallback(async () => {
    if (!filePath) return;
    if (!window.api || typeof window.api.compileRunTests !== 'function') {
      setError('Run not available')
      return;
    }
    setError(null);
    
    // Set all tests to running state and collapse them
    const runningMap = {}
    tests.forEach(t => { runningMap[t.id] = true });
    setRunningTests(runningMap);
    setExpandedTests({});  // Collapse all tests
    
    try {
      // send full tests including id so results can be associated
      const resp = await window.api.compileRunTests(filePath, tests.map(t => ({ id: t.id, name: t.name, input: t.input, expected: t.expected })));
      if (!resp.success) {
        // Check if it's a compilation error
        if (resp.error && resp.error.includes('error')) {
          onCompileError?.(resp.error);
          throw new Error('Compilation failed');
        }
        throw new Error(resp.error || 'Run failed');
      }
      
      // Clear any previous compile errors
      onCompileError?.(null);
      
      // resp.data is array of {id, name, passed, output, expected, error}
      const map = {}
      for (const r of resp.data) {
        if (r.id) map[r.id] = r
      }
      setResults(map)
      
      // Expand failed tests
      const expandMap = {}
      resp.data.forEach(r => {
        if (r.id && !r.passed) expandMap[r.id] = true;
      });
      setExpandedTests(expandMap);
    } catch (err) {
      setError(err.message)
      console.error('Error running tests:', err)
    } finally {
      setRunningTests({}) // Clear running state
    }
  }, [filePath, tests]);

  // Load tests when file changes
  useEffect(() => {
    loadTests();
  }, [loadTests]);

  if (!filePath) {
    return (
      <div className={styles.testsPane}>
        <div className={styles.empty}>Select a .cpp file to manage tests</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.testsPane}>
        <div className={styles.empty}>Loading tests...</div>
      </div>
    );
  }

  return (
    <div className={styles.testsPane}>
      <div className={styles.header}>
        <h3>Test Cases</h3>
      </div>
      
      <div className={styles.testList}>
        <div style={{ padding: 8, borderBottom: '1px solid #2a2a2a' }}>
          <button className={styles.addButton} onClick={handleRunAll}>Run Tests</button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        {tests.length === 0 ? (
          <div className={styles.empty}>No tests yet. Add one to get started!</div>
        ) : (
          tests.map((test, idx) => (
            <TestCard
              key={test.id}
              test={test}
              testNumber={idx + 1}
              running={!!runningTests[test.id]}
              result={results[test.id]}
              expanded={!!expandedTests[test.id]}
              onToggleExpand={toggleExpand}
              onFieldChange={handleFieldChange}
              onRun={handleRun}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid #2a2a2a' }}>
        <button className={styles.addButton} onClick={handleAdd}>+ Add Test</button>
      </div>
    </div>
  );
};

export default TestsPane;
