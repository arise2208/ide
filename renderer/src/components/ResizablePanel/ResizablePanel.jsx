import React, { useState, useEffect, useRef } from 'react';
import styles from './ResizablePanel.module.css';

export const ResizablePanel = ({
  children,
  defaultSize = 300,
  minSize = 100,
  maxSize = 800,
  direction = 'horizontal',
  className = ''
}) => {
  const [size, setSize] = useState(defaultSize);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (!panelRef.current) return;

      const rect = panelRef.current.getBoundingClientRect();
      let newSize;

      if (direction === 'horizontal') {
        newSize = e.clientX - rect.left;
      } else {
        newSize = e.clientY - rect.top;
      }

      newSize = Math.max(minSize, Math.min(maxSize, newSize));
      setSize(newSize);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    document.body.style.cursor = direction === 'horizontal' ? 'ew-resize' : 'ns-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, direction, minSize, maxSize]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const style = direction === 'horizontal'
    ? { width: size, minWidth: size, maxWidth: size }
    : { height: size, minHeight: size, maxHeight: size };

  return (
    <div
      ref={panelRef}
      className={`${styles.panel} ${className}`}
      style={style}
    >
      {children}
      <div
        className={`${styles.resizer} ${styles[direction]} ${isResizing ? styles.resizing : ''}`}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
};
