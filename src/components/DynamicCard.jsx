import { useState, useRef } from 'react'

const DynamicCard = ({ id, title, defaultLayout, onUpdate, children, zIndex = 10, onInteract, isEditable = true }) => {
  const [layout, setLayout] = useState(defaultLayout || { x: 10, y: 10, w: 300, h: 250 });
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef(null);

  const startDrag = (e) => {
    if (!isEditable) return; // Locks dragging when not in edit mode
    if (e.target.className.includes('resize-handle') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
    setIsDragging(true);
    if (onInteract) onInteract(id);
    const scrollContainer = cardRef.current.closest('.canvas-scroll-area') || document.documentElement;
    const startMouseX = e.clientX + scrollContainer.scrollLeft;
    const startMouseY = e.clientY + scrollContainer.scrollTop;
    const offsetX = startMouseX - layout.x;
    const offsetY = startMouseY - layout.y;
    let finalX = layout.x;
    let finalY = layout.y;

    const onMouseMove = (moveEvent) => {
      const buffer = 60;
      const rect = scrollContainer.getBoundingClientRect();
      if (moveEvent.clientY > rect.bottom - buffer) scrollContainer.scrollBy(0, 15);
      if (moveEvent.clientY < rect.top + buffer) scrollContainer.scrollBy(0, -15);
      if (moveEvent.clientX > rect.right - buffer) scrollContainer.scrollBy(15, 0);
      if (moveEvent.clientX < rect.left + buffer) scrollContainer.scrollBy(-15, 0);
      const currentMouseX = moveEvent.clientX + scrollContainer.scrollLeft;
      const currentMouseY = moveEvent.clientY + scrollContainer.scrollTop;
      finalX = Math.max(0, currentMouseX - offsetX);
      finalY = Math.max(0, currentMouseY - offsetY);
      setLayout(prev => ({ ...prev, x: finalX, y: finalY }));
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      onUpdate(id, { x: finalX, y: finalY, w: layout.w, h: layout.h }); 
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const startResize = (e) => {
    if (!isEditable) return; // Locks resizing when not in edit mode
    e.stopPropagation(); e.preventDefault();
    const scrollContainer = cardRef.current.closest('.canvas-scroll-area') || document.documentElement;
    const startMouseX = e.clientX + scrollContainer.scrollLeft;
    const startMouseY = e.clientY + scrollContainer.scrollTop;
    const startW = layout.w; const startH = layout.h;
    let finalW = startW; let finalH = startH;

    const onMouseMove = (moveEvent) => {
      const buffer = 60;
      const rect = scrollContainer.getBoundingClientRect();
      if (moveEvent.clientY > rect.bottom - buffer) scrollContainer.scrollBy(0, 15);
      if (moveEvent.clientY < rect.top + buffer) scrollContainer.scrollBy(0, -15);
      if (moveEvent.clientX > rect.right - buffer) scrollContainer.scrollBy(15, 0);
      const currentMouseX = moveEvent.clientX + scrollContainer.scrollLeft;
      const currentMouseY = moveEvent.clientY + scrollContainer.scrollTop;
      finalW = Math.max(250, startW + (currentMouseX - startMouseX));
      finalH = Math.max(150, startH + (currentMouseY - startMouseY));
      setLayout(prev => ({ ...prev, w: finalW, h: finalH }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      onUpdate(id, { x: layout.x, y: layout.y, w: finalW, h: finalH });
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div ref={cardRef} className={`absolute acrylic rounded-xl shadow-lg flex flex-col overflow-hidden transition-shadow ${isEditable ? 'ring-2 ring-indigo-500/20' : ''}`} style={{ left: layout.x, top: layout.y, width: layout.w, height: layout.h, zIndex: isDragging ? zIndex + 100 : zIndex }}>
      <div className={`px-4 py-2 bg-white/40 border-b border-slate-200/50 flex justify-between items-center select-none ${isEditable ? 'cursor-grab active:cursor-grabbing' : ''}`} onMouseDown={isEditable ? startDrag : undefined}>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 pointer-events-none">{title}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">{children}</div>
      {isEditable && (
        <div className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-1 opacity-50 hover:opacity-100" onMouseDown={startResize}>
          <div className="w-2 h-2 bg-slate-400 rounded-sm pointer-events-none"></div>
        </div>
      )}
    </div>
  );
};;

// --- WORKSPACE DRAWERS ---

/// ============================================================================

export { DynamicCard }
