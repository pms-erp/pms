// src/components/rich-text-display.tsx
"use client";

import DOMPurify from "dompurify";

interface Props {
  content: string;
  className?: string;
}

export function RichTextDisplay({ content, className = "" }: Props) {
  if (!content) {
    return <p className="text-sm text-muted-foreground italic">No content</p>;
  }

  // Sanitize HTML to prevent XSS
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "a",
      "span",
      "div",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
  });

  return (
    <div
      className={`
        prose prose-sm max-w-none
        text-sm leading-relaxed
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2
        [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
        [&_p]:mb-2 [&_p]:last:mb-0
        [&_p:empty]:h-4 [&_p:empty]:mb-2
        [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-2
        [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-2
        [&_li]:mb-1
        [&_a]:text-blue-500 [&_a]:underline [&_a]:break-all
        [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:break-all
        [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-2
        [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:mb-2
        ${className}
      `}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
