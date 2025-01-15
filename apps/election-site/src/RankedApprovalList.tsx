import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Button } from '@repo/ui';
import { Grip, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface RankedApprovalListProps {
  candidates: Array<{ id: string; name: string }>;
  onChange: (change: {
    ranking: Array<{ id: string; name: string }>;
    approved: string[];
  }) => void;
  onRemove?: (id: string) => void;
  showApprovalLine?: boolean; // New prop to control approval line visibility
}

const RankedApprovalList: React.FC<RankedApprovalListProps> = ({
  candidates,
  onChange,
  onRemove,
  showApprovalLine = false, // Default to false
}) => {
  const [items, setItems] = useState(candidates);
  const [approvalLine, setApprovalLine] = useState(candidates.length);
  const [isDraggingLine, setIsDraggingLine] = useState(false);

  useEffect(() => {
    setItems(candidates);
  }, [candidates]);

  // Handle candidate reordering
  const onDragEnd = (result: any) => {
    if (!result.destination) return;

    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);

    setItems(newItems);
    onChange({
      ranking: newItems,
      approved: showApprovalLine
        ? newItems.slice(0, approvalLine).map((c) => c.id)
        : [],
    });
  };
  // Handle mouse/touch events for approval line
  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setIsDraggingLine(true);
    setApprovalLine(index);
    onChange({
      ranking: items,
      approved: items.slice(0, index).map((c) => c.id),
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingLine) return;

    // Get container bounds
    const container = document.getElementById('candidate-list');
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const itemElements = Array.from(container.children);

    // Find closest item to mouse position
    let closestIndex = 0;
    let closestDistance = Infinity;

    for (let i = 0; i < itemElements.length; i++) {
      const item = itemElements[i];
      const itemBounds = item.getBoundingClientRect();
      const itemCenter = itemBounds.top + itemBounds.height / 2;
      const distance = Math.abs(itemCenter - e.clientY);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }

    setApprovalLine(closestIndex);
    onChange({
      ranking: items, // Use the state items array, not DOM elements
      approved: items.slice(0, closestIndex).map((item) => item.id),
    });
  };

  const handleMouseUp = () => {
    setIsDraggingLine(false);
  };

  useEffect(() => {
    if (isDraggingLine) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingLine]);
  return (
    <div className="relative w-full" onMouseLeave={handleMouseUp}>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="candidates">
          {(provided) => (
            <div
              id="candidate-list"
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="space-y-2"
            >
              {items.map((candidate, index) => (
                <React.Fragment key={candidate.id}>
                  {showApprovalLine && index === approvalLine && (
                    <div
                      className="h-1 bg-blue-400 my-3 cursor-ns-resize relative group"
                      onMouseDown={(e) => handleMouseDown(e, index)}
                    >
                      <div className="absolute right-0 bg-blue-500 text-white text-xs px-2 py-1 rounded -top-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        Drag to move approval line
                      </div>
                    </div>
                  )}
                  <Draggable draggableId={candidate.id} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        data-candidate-id={candidate.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border shadow-sm transition-colors
                            ${
                              showApprovalLine && index < approvalLine
                                ? 'bg-green-50 border-green-200'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                      >
                        <div className="flex items-center gap-3 flex-grow">
                          <span {...provided.dragHandleProps}>
                            <Grip className="w-4 h-4 text-slate-400" />
                          </span>
                          <span className="w-6 font-medium text-slate-500">
                            {index + 1}.
                          </span>
                          <span className="flex-grow font-medium text-slate-700">
                            {candidate.name}
                          </span>
                        </div>
                        {onRemove && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemove(candidate.id)}
                            className="text-slate-500 hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </Draggable>
                </React.Fragment>
              ))}
              {provided.placeholder}
              {showApprovalLine && approvalLine === items.length && (
                <div
                  className="h-1 bg-blue-400 my-3 cursor-ns-resize group"
                  onMouseDown={(e) => handleMouseDown(e, items.length)}
                >
                  <div className="absolute right-0 bg-blue-500 text-white text-xs px-2 py-1 rounded -top-8 opacity-0 group-hover:opacity-100 transition-opacity">
                    Drag to move approval line
                  </div>
                </div>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
};

export default RankedApprovalList;
