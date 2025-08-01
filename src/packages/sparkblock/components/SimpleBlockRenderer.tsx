// Simple block renderer component with drag and drop support
import React, { useState, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SparkBlock, SparkBlockAdapter } from '../types';
import { DefaultBlockRenderers } from './blocks/DefaultBlockRenderers';
import { isCustomBlock, blockManifestToJsonSchema } from '../utils/SchemaConverter';
import SchemaDrivenForm from '@/core/components/SchemaDrivenForm';

export interface SimpleBlockRendererProps {
  block: SparkBlock;
  isSelected: boolean;
  isEditing: boolean;
  readonly: boolean;
  onClick: () => void;
  onMarkdownUpdate: (markdown: string) => void;
  onBlur: () => void;
  onSave: () => void;
  onCancel: () => void;
  onShowBlockMenu: (type: 'create' | 'convert', blockId?: string, position?: { x: number, y: number }) => void;
  adapter: SparkBlockAdapter<string> | null;
}

export function SimpleBlockRenderer({
  block,
  isSelected,
  isEditing,
  readonly,
  onClick,
  onMarkdownUpdate,
  onBlur,
  onSave,
  onCancel,
  onShowBlockMenu,
  adapter,
}: SimpleBlockRendererProps) {
  const [localContent, setLocalContent] = useState('');
  const [blockDefinition, setBlockDefinition] = useState<any>(null);
  const [dragStartTime, setDragStartTime] = useState<number | null>(null);
  const [hasDragged, setHasDragged] = useState(false);
  const [formData, setFormData] = useState<object>({});

  // DnD Kit sortable
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    data: {
      type: 'sparkblock',
      block
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
  };

  // Handle drag start
  const handleDragStart = useCallback(() => {
    setDragStartTime(Date.now());
    setHasDragged(false);
  }, []);

  // Handle drag move
  const handleDragMove = useCallback(() => {
    setHasDragged(true);
  }, []);

  const handleDragEnd = useCallback((e: any) => {
    const dragEndTime = Date.now();
    const dragDuration = dragStartTime ? dragEndTime - dragStartTime : 0;

    // If it was a quick tap (< 200ms) without significant drag movement, show convert menu
    if (!hasDragged && dragDuration < 200) {
      const rect = e.target.getBoundingClientRect();
      onShowBlockMenu('convert', block.id, { x: rect.right + 10, y: rect.top });
    }

    setDragStartTime(null);
    setHasDragged(false);
  }, [dragStartTime, hasDragged, onShowBlockMenu, block.id]);

  // Convert block content to markdown for editing
  const getEditingContent = useCallback(() => {
    switch (block.type) {
      case 'core:heading_1':
        return `# ${(block.content.text as string) || ''}`;
      case 'core:heading_2':
        return `## ${(block.content.text as string) || ''}`;
      case 'core:heading_3':
        return `### ${(block.content.text as string) || ''}`;
      case 'core:quote':
        return `> ${(block.content.text as string) || ''}`;
      case 'core:paragraph':
      default:
        return (block.content.text as string) || '';
    }
  }, [block.type, block.content]);

  // Load block definition when needed
  React.useEffect(() => {
    if (!blockDefinition && adapter && isCustomBlock(block.type)) {
      const loadBlockDefinition = async () => {
        try {
          const availableBlocks = await adapter.getAvailableBlocks();
          const definition = availableBlocks.find(b => b.id === block.type);
          if (definition) {
            setBlockDefinition(definition);
          } else {
            console.warn('Block definition not found for:', block.type);
          }
        } catch (error) {
          console.error('Failed to load block definition:', error);
        }
      };
      loadBlockDefinition();
    }
  }, [adapter, block.type]);

  // Initialize form data when editing starts
  React.useEffect(() => {
    if (isEditing && isCustomBlock(block.type)) {
      setFormData({ ...block.content, ...block.config });
    }
  }, [isEditing, block.content, block.config, block.type]);

  // Handle save button click
  const handleSave = useCallback(async () => {
    if (!blockDefinition || !adapter) return;

    try {
      // Update block through adapter
      const updatedBlock = {
        ...block,
        content: Object.fromEntries(
          Object.entries(formData).filter(([key]) =>
            blockDefinition.fields && key in blockDefinition.fields
          )
        ),
        config: Object.fromEntries(
          Object.entries(formData).filter(([key]) =>
            blockDefinition.config && key in blockDefinition.config
          )
        )
      };

      // Convert back to markdown and update
      const markdown = await adapter.serialize([updatedBlock]);
      onMarkdownUpdate(markdown);
      onSave();
    } catch (error) {
      console.error('Failed to save block:', error);
    }
  }, [blockDefinition, adapter, block, formData, onMarkdownUpdate, onSave]);

  // Handle cancel button click
  const handleCancel = useCallback(() => {
    // Reset form data to original values
    setFormData({ ...block.content, ...block.config });
    onCancel();
  }, [block.content, block.config, onCancel]);

  // Generic renderer for custom blocks in view mode
  const renderCustomBlockSummary = useCallback(() => {
    if (!blockDefinition) {
      return (
        <div className="border border-gray-300 rounded-md p-4 my-2 bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-base">⚙️</span>
            <span className="font-semibold text-gray-700">
              {block.type.replace('core:', '').replace('_', ' ')}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-1">Loading...</div>
        </div>
      );
    }

    const allData = { ...block.content, ...block.config };
    const displayName = blockDefinition.name || block.type.replace('core:', '').replace('_', ' ');

    // Get the most important fields to display
    const importantFields: Array<{ key: string; label: string; value: any }> = [];

    // Add fields from block definition
    if (blockDefinition.fields) {
      for (const [key, fieldDef] of Object.entries(blockDefinition.fields)) {
        const value = allData[key];
        if (value !== undefined && value !== '' && value !== null) {
          importantFields.push({
            key,
            label: (fieldDef as any).label || key,
            value
          });
        }
      }
    }

    // Add config from block definition
    if (blockDefinition.config) {
      for (const [key, configDef] of Object.entries(blockDefinition.config)) {
        const value = allData[key];
        if (value !== undefined && value !== '' && value !== null) {
          importantFields.push({
            key,
            label: (configDef as any).label || key,
            value
          });
        }
      }
    }

    return (
      <div className="border border-gray-300 rounded-md p-4 my-2 bg-gray-50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">⚙️</span>
          <span className="font-semibold text-gray-700">{displayName}</span>
        </div>
        {importantFields.length > 0 ? (
          <div className="space-y-1">
            {importantFields.slice(0, 4).map((field) => (
              <div key={field.key} className="text-xs text-gray-500">
                <strong>{field.label}:</strong> {String(field.value)}
              </div>
            ))}
            {importantFields.length > 4 && (
              <div className="text-xs text-gray-400 italic">
                ...and {importantFields.length - 4} more settings
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic">No configuration set</div>
        )}
      </div>
    );
  }, [blockDefinition, block.content, block.config, block.type]);

  const renderContent = () => {
    // For custom blocks, show form if editing
    if (isEditing && isCustomBlock(block.type)) {
      if (blockDefinition && adapter) {
        const { schema, uiSchema } = blockManifestToJsonSchema(blockDefinition, adapter);

        return (
          <div className="p-4 border border-blue-500 rounded-md my-2 bg-blue-50">
            <div className="mb-3 text-sm font-medium text-gray-700">Edit {blockDefinition.name || block.type}</div>
            <SchemaDrivenForm
              schema={schema}
              uiSchema={uiSchema}
              formData={formData}
              onFormChange={(newFormData: object) => {
                setFormData(newFormData);
              }}
            />
            <div className="flex gap-2 mt-4 pt-3 border-t border-blue-200">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Save Changes
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      } else {
        // Show loading state while block definition is loading
        return (
          <div className="p-3 border border-gray-300 rounded-md my-2 text-center text-gray-500">
            Loading block configuration...
          </div>
        );
      }
    }

    // For editing mode on non-custom blocks, show textarea
    if (isEditing && !isCustomBlock(block.type)) {
      return (
        <textarea
          value={localContent || getEditingContent()}
          onChange={(e) => setLocalContent(e.target.value)}
          onBlur={() => {
            if (localContent !== getEditingContent()) {
              onMarkdownUpdate(localContent);
            }
            onBlur();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (localContent !== getEditingContent()) {
                onMarkdownUpdate(localContent);
              }
              onBlur();
            }
            if (e.key === 'Escape') {
              setLocalContent('');
              onBlur();
            }
          }}
          autoFocus
          className="w-full min-h-[60px] border-none outline-none resize-y text-base leading-6 font-inherit bg-transparent p-0 focus:outline-none"
        />
      );
    }

    // For custom blocks in view mode, show a generic summary
    if (isCustomBlock(block.type)) {
      return renderCustomBlockSummary();
    }

    // Use DefaultBlockRenderers for core blocks
    const blockTypeKey = block.type.replace('core:', '') as keyof typeof DefaultBlockRenderers;
    const RendererComponent = DefaultBlockRenderers[blockTypeKey] || DefaultBlockRenderers.unknown;

    if (!RendererComponent) {
      return <div>Unknown block type: {block.type}</div>;
    }

    // Fix: Create proper context object with correct onChange signature
    const renderContext = {
      isEditing: false,
      isSelected,
      isFocused: false,
      isDragging,
      nestingLevel: 0,
      readonly,
      theme: undefined,
      onFocus: () => onClick(),
      onChange: (newContent: Record<string, unknown>) => {
        // Convert content changes back to markdown if needed
        if (adapter) {
          const updatedBlock = { ...block, content: newContent };
          adapter.serialize([updatedBlock]).then(markdown => {
            onMarkdownUpdate(markdown);
          }).catch(console.error);
        }
      },
      onKeyDown: () => { },
    };

    return <RendererComponent block={block} context={renderContext} />;
  };

  const blockClasses = [
    'relative my-1 rounded-md transition-all duration-200 group',
    !readonly && 'hover:bg-gray-50',
    isSelected && 'bg-blue-50 ring-2 ring-blue-500',
    isDragging && 'opacity-80 z-[1000]',
    readonly && 'pointer-events-none'
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={blockClasses}
      data-block-type={block.type}
      onClick={onClick}
      {...attributes}
    >
      {!readonly && (
        <div className="absolute -left-20 top-2 md:left-2 md:top-2 flex flex-row gap-1 opacity-0 transition-opacity duration-200 z-[100] p-1 -m-1 group-hover:opacity-100 hover:opacity-100 md:bg-white/90 md:rounded md:shadow-sm">
          <button
            className="flex items-center justify-center w-7 h-7 bg-white border border-gray-300 rounded-md cursor-pointer text-gray-500 transition-all duration-200 text-base font-medium shadow-sm hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:scale-105 hover:shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onShowBlockMenu('create', block.id, { x: rect.right + 10, y: rect.top });
            }}
            title="Add block below"
          >
            +
          </button>
          <div
            className="flex items-center justify-center w-7 h-7 bg-white border border-gray-300 rounded-md text-gray-500 transition-all duration-200 text-base font-medium shadow-sm hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:scale-105 hover:shadow-md active:cursor-grabbing"
            {...listeners}
            onMouseDown={handleDragStart}
            onMouseMove={hasDragged ? undefined : handleDragMove}
            onMouseUp={handleDragEnd}
            onTouchStart={handleDragStart}
            onTouchMove={hasDragged ? undefined : handleDragMove}
            onTouchEnd={handleDragEnd}
            title="Tap to convert or drag to move"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            ⋮⋮
          </div>
        </div>
      )}

      <div className="px-3 py-2 min-h-6">
        {renderContent()}
      </div>
    </div>
  );
}