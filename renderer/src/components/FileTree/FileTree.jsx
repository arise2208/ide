import React, { useState, useCallback } from 'react';
import styles from './FileTree.module.css';

// Icons as React components for better performance
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

const FileTreeItem = ({ item, onSelect, selectedPath }) => {
  const [expanded, setExpanded] = useState(false);
  const isCpp = item.name.endsWith('.cpp');
  const isSelected = selectedPath === item.path;

  const handleClick = useCallback(() => {
    if (item.isDir) {
      setExpanded(prev => !prev);
    } else if (isCpp) {
      onSelect(item.path);
    }
  }, [item, isCpp, onSelect]);

  return (
    <div>
      <div 
        className={`${styles.item} ${isSelected ? styles.itemSelected : ''} ${
          item.isDir ? styles.folder : styles.file
        } ${isCpp ? styles.cpp : ''}`}
        onClick={handleClick}
      >
        {item.isDir && <ArrowIcon expanded={expanded} />}
        {item.isDir ? <FolderIcon /> : <FileIcon />}
        <span>{item.name}</span>
        <span className={styles.meta}>
          {formatFileSize(item.size)}
        </span>
      </div>
      
      {item.isDir && expanded && item.children && (
        <div className={styles.children}>
          {item.children.map(child => (
            <FileTreeItem
              key={child.path}
              item={child}
              onSelect={onSelect}
              selectedPath={selectedPath}
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
  selectedPath 
}) => {
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
        />
      ))}
    </div>
  );
};

export default FileTree;