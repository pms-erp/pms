"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect, useCallback } from "react";

interface Props {
  content: string;
  onChange: (value: string) => void;
}

export default function RichTextEditor({ content, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-500 underline cursor-pointer",
        },
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      let html = editor.getHTML();
      html = html.replace(/<p><\/p>/g, "<p><br /></p>");
      onChange(html);
    },
    editorProps: {
      attributes: {
        class:
          "min-h-[140px] text-sm outline-none max-w-none whitespace-pre-wrap break-words overflow-wrap-anywhere [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_ul]:list-disc [&_ul]:ml-5 [&_li]:mb-1 [&_a]:break-all [&_code]:break-all",
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;

    // If already a link, remove it
    if (editor.isActive("link")) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, "");

    // Use selected text as the URL
    if (selectedText) {
      const url = selectedText.startsWith("http")
        ? selectedText
        : `https://${selectedText}`;

      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
      return;
    }

    // Fallback: nothing selected, prompt manually
    const url = window.prompt("Enter URL", "https://");
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border rounded-lg p-3 bg-background">
      <div className="flex flex-wrap gap-2 mb-3 border-b pb-2">
        {/* Bold */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`text-xs px-2 py-1 rounded ${
            editor.isActive("bold") ? "bg-muted" : "hover:bg-muted"
          }`}
        >
          Bold
        </button>

        {/* Italic */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`text-xs px-2 py-1 rounded ${
            editor.isActive("italic") ? "bg-muted" : "hover:bg-muted"
          }`}
        >
          Italic
        </button>

        {/* H2 */}
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          className={`text-xs px-2 py-1 rounded ${
            editor.isActive("heading", { level: 2 })
              ? "bg-muted"
              : "hover:bg-muted"
          }`}
        >
          H2
        </button>

        {/* Bullet List */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`text-xs px-2 py-1 rounded ${
            editor.isActive("bulletList") ? "bg-muted" : "hover:bg-muted"
          }`}
        >
          List
        </button>

        {/* Link */}
        <button
          type="button"
          onClick={setLink}
          className={`text-xs px-2 py-1 rounded ${
            editor.isActive("link") ? "bg-muted" : "hover:bg-muted"
          }`}
        >
          Link
        </button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
