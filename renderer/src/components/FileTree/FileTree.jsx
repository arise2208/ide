import React, { useState, useCallback, useRef } from 'react';
import styles from './FileTree.module.css';

const FolderIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
  </svg>
);

const FileIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2z"/>
  </svg>
);

const ArrowIcon = ({ expanded }) => (
  <svg
    className={`${styles.arrow} ${expanded ? styles.arrowExpanded : ''}`}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
  </svg>
);

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  const mb = kb / 1024;
  return mb.toFixed(1) + ' MB';
};

const ContextMenu = ({ x, y, item, onClose, onCreateFile, onCreateFolder, onDelete, onRename, onCut }) => {
  const menuRef = useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
    >
      {item.isDir && (
        <>
          <div className={styles.menuItem} onClick={() => { onCreateFile(item); onClose(); }}>
            New File
          </div>
          <div className={styles.menuItem} onClick={() => { onCreateFolder(item); onClose(); }}>
            New Folder
          </div>
          <div className={styles.menuDivider} />
        </>
      )}
      <div className={styles.menuItem} onClick={() => { onRename(item); onClose(); }}>
        Rename
      </div>
      <div className={styles.menuItem} onClick={() => { onCut(item); onClose(); }}>
        Cut
      </div>
      <div className={styles.menuDivider} />
      <div className={styles.menuItem} style={{ color: '#f48771' }} onClick={() => { onDelete(item); onClose(); }}>
        Delete
      </div>
    </div>
  );
};

const FileTreeItem = ({ item, onSelect, selectedPath, onRefresh, cutItem, setCutItem }) => {
  const [expanded, setExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(item.name);
  const inputRef = useRef(null);

  const isCpp = item.name.endsWith('.cpp');
  const isSelected = selectedPath === item.path;
  const isCut = cutItem === item.path;

  const handleClick = useCallback(() => {
    if (item.isDir) {
      setExpanded(prev => !prev);
    } else if (isCpp) {
      onSelect(item.path);
    }
  }, [item, isCpp, onSelect]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCreateFile = useCallback(async (parent) => {
    const fileName = prompt('Enter file name:');
    if (!fileName) return;

    const filePath = `${parent.path}/${fileName}`;
    const result = await window.api.createFile(filePath, false);

    if (result.success) {
      onRefresh();
    } else {
      alert(`Failed to create file: ${result.error}`);
    }
  }, [onRefresh]);

  const handleCreateFolder = useCallback(async (parent) => {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    const folderPath = `${parent.path}/${folderName}`;
    const result = await window.api.createFile(folderPath, true);

    if (result.success) {
      onRefresh();
    } else {
      alert(`Failed to create folder: ${result.error}`);
    }
  }, [onRefresh]);

  const handleDelete = useCallback(async (item) => {
    const confirmed = confirm(`Are you sure you want to delete ${item.name}?`);
    if (!confirmed) return;

    const result = await window.api.deleteFile(item.path);

    if (result.success) {
      onRefresh();
    } else {
      alert(`Failed to delete: ${result.error}`);
    }
  }, [onRefresh]);

  const handleRename = useCallback((item) => {
    setNewName(item.name);
    setRenaming(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (newName === item.name || !newName) {
      setRenaming(false);
      return;
    }

    const dirPath = item.path.substring(0, item.path.lastIndexOf('/'));
    const newPath = `${dirPath}/${newName}`;

    const result = await window.api.renameFile(item.path, newPath);

    if (result.success) {
      setRenaming(false);
      onRefresh();
    } else {
      alert(`Failed to rename: ${result.error}`);
      setRenaming(false);
    }
  }, [item, newName, onRefresh]);

  const handleCut = useCallback((item) => {
    setCutItem(item.path);
  }, [setCutItem]);

  const handlePaste = useCallback(async (targetFolder) => {
    if (!cutItem) return;

    const fileName = cutItem.substring(cutItem.lastIndexOf('/') + 1);
    const destPath = `${targetFolder.path}/${fileName}`;

    const result = await window.api.cutFile(cutItem, destPath);

    if (result.success) {
      setCutItem(null);
      onRefresh();
    } else {
      alert(`Failed to move: ${result.error}`);
    }
  }, [cutItem, setCutItem, onRefresh]);

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (renaming && e.key === 'Enter') {
        handleRenameSubmit();
      } else if (renaming && e.key === 'Escape') {
        setRenaming(false);
        setNewName(item.name);
      }
    };

    if (renaming) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [renaming, handleRenameSubmit, item.name]);

  return (
    <div>
      <div
        className={`${styles.item} ${isSelected ? styles.itemSelected : ''} ${
          item.isDir ? styles.folder : styles.file
        } ${isCpp ? styles.cpp : ''} ${isCut ? styles.cutItem : ''}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={(e) => {
          if (item.isDir && cutItem) {
            e.stopPropagation();
            handlePaste(item);
          }
        }}
      >
        {item.isDir && <ArrowIcon expanded={expanded} />}
        {item.isDir ? <FolderIcon /> : <FileIcon />}
        {renaming ? (
          <input
            ref={inputRef}
            className={styles.renameInput}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span>{item.name}</span>
        )}
        <span className={styles.meta}>
          {formatFileSize(item.size)}
        </span>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={item}
          onClose={() => setContextMenu(null)}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onDelete={handleDelete}
          onRename={handleRename}
          onCut={handleCut}
        />
      )}

      {item.isDir && expanded && item.children && (
        <div className={styles.children}>
          {item.children.map(child => (
            <FileTreeItem
              key={child.path}
              item={child}
              onSelect={onSelect}
              selectedPath={selectedPath}
              onRefresh={onRefresh}
              cutItem={cutItem}
              setCutItem={setCutItem}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const FileTree = ({
  files,
  onSelect,
  selectedPath,
  onRefresh
}) => {
  const [cutItem, setCutItem] = useState(null);

  if (!files || files.length === 0) {
    return <div className={styles.fileTree}>No files to display</div>;
  }

  return (
    <div className={styles.fileTree}>
      {files.map(item => (
        <FileTreeItem
          key={item.path}
          item={item}
          onSelect={onSelect}
          selectedPath={selectedPath}
          onRefresh={onRefresh}
          cutItem={cutItem}
          setCutItem={setCutItem}
        />
      ))}
    </div>
  );
};

export default FileTree;
