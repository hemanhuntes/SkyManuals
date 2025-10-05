import React, { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '../lib/utils';

interface EditorProps {
  content?: any;
  placeholder?: string;
  onChange?: (content: any) => void;
  className?: string;
}

export const Editor: React.FC<EditorProps> = ({
  content,
  placeholder = 'Start writing...',
  onChange,
  className,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: content || {
      type: 'doc',
      content: [],
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
  });

  useEffect(() => {
    if (editor && content && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return (
      <div className={cn('border border-gray-300 rounded-md p-4 bg-gray-50', className)}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('border border-gray-300 rounded-md', className)}>
      <EditorToolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="min-h-[200px] p-4 prose max-w-none"
      />
    </div>
  );
};

interface EditorToolbarProps {
  editor: any;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor }) => {
  if (!editor) return null;

  return (
    <div className="border-b border-gray-300 p-2 flex gap-1">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={cn(
          'px-2 py-1 text-sm rounded hover:bg-gray-100',
          editor.isActive('bold') && 'bg-gray-200'
        )}
      >
        Bold
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={cn(
          'px-2 py-1 text-sm rounded hover:bg-gray-100',
          editor.isActive('italic') && 'bg-gray-200'
        )}
      >
        Italic
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={cn(
          'px-2 py-1 text-sm rounded hover:bg-gray-100',
          editor.isActive('heading', { level: 1 }) && 'bg-gray-200'
        )}
      >
        H1
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={cn(
          'px-2 py-1 text-sm rounded hover:bg-gray-100',
          editor.isActive('heading', { level: 2 }) && 'bg-gray-200'
        )}
      >
        H2
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={cn(
          'px-2 py-1 text-sm rounded hover:bg-gray-100',
          editor.isActive('heading', { level: 3 }) && 'bg-gray-200'
        )}
      >
        H3
      </button>
      <div className="border-l border-gray-300 mx-2"></div>
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={cn(
          'px-2 py-1 text-sm rounded hover:bg-gray-100',
          editor.isActive('bulletList') && 'bg-gray-200'
        )}
      >
        List
      </button>
    </div>
  );
};

export default Editor;






