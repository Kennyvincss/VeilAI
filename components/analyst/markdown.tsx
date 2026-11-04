"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders model output as Markdown. Raw HTML is NOT rendered (react-markdown
 * escapes it by default) and links open safely in a new tab, so model output
 * cannot inject scripts or markup.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-veil">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const safe = typeof href === "string" && /^https?:\/\//i.test(href);
            return safe ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-strong underline decoration-dotted underline-offset-2">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            );
          },
          img: () => null,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
