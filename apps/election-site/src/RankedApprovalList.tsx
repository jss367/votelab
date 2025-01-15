import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from '@hello-pangea/dnd';
import { Button } from '@repo/ui';
import { ArrowDown, ArrowUp, Grip, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface RankedApprovalListProps {
  candidates: Array<{ id: string; name: string }>;
  onChange: (change: {
    ranking: Array<{ id: string; name: string }>;
    approved: string[];
  }) => void;
  onRemove?: (id: string) => void;
  showApprovalLine?: boolean;
}

const RankedApprovalList: React.FC<RankedApprovalListProps> = ({
  candidates,
  onChange,
  onRemove,
  showApprovalLine = false,
}) => {
  const [items, setItems] =
    useState<Array<{ id: string; name: string }>>(candidates);
  const [approvalLine, setApprovalLine] = useState(
    Math.floor(candidates.length / 2)
  );
  const [isDraggingLine, setIsDraggingLine] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [lastSnapIndex, setLastSnapIndex] = useState(
    Math.floor(candidates.length / 2)
  );

  useEffect(() => {
    setItems(candidates);
  }, [candidates]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    const newItems = Array.from(items);
    const [removed] = newItems.splice(sourceIndex, 1) as [
      { id: string; name: string },
    ];
    newItems.splice(destinationIndex, 0, removed);

    setItems(newItems);
    onChange({
      ranking: newItems,
      approved: showApprovalLine
        ? newItems.slice(0, approvalLine).map((c) => c.id)
        : [],
    });
  };

  const handleApprovalLineStart = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setIsDraggingLine(true);
    setDragStartY(e.clientY);
    setLastSnapIndex(index);
  };

  const handleApprovalLineMove = (e: MouseEvent) => {
    if (!isDraggingLine) {
      return;
    }

    const container = document.getElementById('candidate-list');
    if (!container) {
      return;
    }

    const itemElements = Array.from(container.children);
    const mouseY = e.clientY;

    let closestIndex = lastSnapIndex;
    let closestDistance = Infinity;

    itemElements.forEach((item, index) => {
      const itemBounds = item.getBoundingClientRect();
      const itemCenter = itemBounds.top + itemBounds.height / 2;
      const distance = Math.abs(itemCenter - mouseY);

      if (distance < closestDistance && distance < 30) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex !== lastSnapIndex) {
      setLastSnapIndex(closestIndex);
      setApprovalLine(closestIndex);
      onChange({
        ranking: items,
        approved: items.slice(0, closestIndex).map((item) => item.id),
      });
    }
  };

  const handleApprovalLineEnd = () => {
    setIsDraggingLine(false);
  };

  useEffect(() => {
    if (isDraggingLine) {
      document.addEventListener('mousemove', handleApprovalLineMove);
      document.addEventListener('mouseup', handleApprovalLineEnd);
      return () => {
        document.removeEventListener('mousemove', handleApprovalLineMove);
        document.removeEventListener('mouseup', handleApprovalLineEnd);
      };
    }
  }, [isDraggingLine, lastSnapIndex]);

  return (
    <div className="relative w-full" onMouseLeave={handleApprovalLineEnd}>
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
                      className={`relative h-8 -my-4 group cursor-ns-resize ${
                        isDraggingLine ? 'z-50' : 'z-10'
                      }`}
                      onMouseDown={(e) => handleApprovalLineStart(e, index)}
                    >
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-blue-400 shadow-md" />
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 bg-blue-500 text-white text-sm px-3 py-1 rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="flex items-center gap-2">
                          <ArrowUp className="w-4 h-4" />
                          <span>Approved</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowDown className="w-4 h-4" />
                          <span>Not Approved</span>
                        </div>
                      </div>
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-sm font-medium text-blue-600 bg-white px-2 py-0.5 rounded shadow-sm">
                          Approval Line
                        </span>
                      </div>
                    </div>
                  )}
                  <Draggable draggableId={candidate.id} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        data-candidate-id={candidate.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border shadow-sm transition-all duration-200
                          ${
                            showApprovalLine && index < approvalLine
                              ? 'bg-green-50 border-green-200 hover:bg-green-100'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
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
                  className="relative h-8 -my-4 group cursor-ns-resize"
                  onMouseDown={(e) => handleApprovalLineStart(e, items.length)}
                >
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-blue-400 shadow-md" />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 bg-blue-500 text-white text-sm px-3 py-1 rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    Drag to set approval threshold
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
