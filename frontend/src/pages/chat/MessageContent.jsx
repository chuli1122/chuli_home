import { useState, useEffect, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { File as FileIcon } from "lucide-react";
import { loadImageUrl } from "../../utils/db";

// Renders a single image loaded from IndexedDB
const ImageFromDB = memo(({ imageId }) => {
  const [url, setUrl] = useState(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let revoked = false;
    loadImageUrl(imageId).then((u) => {
      if (revoked) return;
      if (u) setUrl(u);
      else setExpired(true);
    });
    return () => { revoked = true; };
  }, [imageId]);

  if (expired) {
    return (
      <div className="flex items-center gap-1 py-1 text-xs" style={{ opacity: 0.5, color: "#999" }}>
        <FileIcon size={12} />
        <span>（图片已过期）</span>
      </div>
    );
  }
  if (!url) return null;
  return <img src={url} alt="" className="max-w-full rounded-lg mb-1" style={{ maxHeight: 200 }} />;
});

// Renders a file marker
const FileMarker = ({ name }) => (
  <div
    className="inline-flex items-center gap-2 rounded-lg px-2 py-1 mb-1 text-xs"
    style={{ background: "rgba(0,0,0,0.06)" }}
  >
    <FileIcon size={14} />
    <span>{name}</span>
  </div>
);

// Custom renderers for react-markdown
const markdownComponents = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    if (match) {
      return (
        <SyntaxHighlighter
          style={oneLight}
          language={match[1]}
          PreTag="div"
          customStyle={{ borderRadius: 8, fontSize: 13, margin: "6px 0", padding: "10px 12px" }}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      );
    }
    return (
      <code
        style={{
          background: "rgba(0,0,0,0.06)",
          borderRadius: 4,
          padding: "1px 5px",
          fontSize: 13,
        }}
        {...props}
      >
        {children}
      </code>
    );
  },
  p({ children }) {
    return <p style={{ margin: "0.3em 0" }}>{children}</p>;
  },
  ul({ children }) {
    return <ul style={{ paddingLeft: "1.4em", margin: "0.3em 0" }}>{children}</ul>;
  },
  ol({ children }) {
    return <ol style={{ paddingLeft: "1.4em", margin: "0.3em 0" }}>{children}</ol>;
  },
  li({ children }) {
    return <li style={{ margin: "0.15em 0" }}>{children}</li>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#7a5080", textDecoration: "underline" }}>
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote style={{ borderLeft: "3px solid #e0c0d0", paddingLeft: 10, margin: "0.4em 0", opacity: 0.85 }}>
        {children}
      </blockquote>
    );
  },
  table({ children }) {
    return (
      <div style={{ overflowX: "auto", margin: "0.4em 0" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th style={{ border: "1px solid #e0d0e8", padding: "4px 8px", background: "rgba(0,0,0,0.03)", textAlign: "left" }}>
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td style={{ border: "1px solid #e0d0e8", padding: "4px 8px" }}>{children}</td>;
  },
  h1({ children }) { return <h1 style={{ fontSize: "1.3em", fontWeight: 700, margin: "0.5em 0 0.3em" }}>{children}</h1>; },
  h2({ children }) { return <h2 style={{ fontSize: "1.2em", fontWeight: 700, margin: "0.4em 0 0.2em" }}>{children}</h2>; },
  h3({ children }) { return <h3 style={{ fontSize: "1.1em", fontWeight: 600, margin: "0.3em 0 0.2em" }}>{children}</h3>; },
  hr() { return <hr style={{ border: "none", borderTop: "1px solid #e0d0e8", margin: "0.5em 0" }} />; },
};

// Regex to split content by image/file markers
const MARKER_REGEX = /(\[图片:[^\]]+\]|\[文件:[^:]+:[^\]]+\])/g;

export default function MessageContent({ content, isMarkdown }) {
  if (!content) return null;

  const parts = content.split(MARKER_REGEX);

  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;

        // Image marker: [图片:imageId]
        const imgMatch = part.match(/^\[图片:([^\]]+)\]$/);
        if (imgMatch) return <ImageFromDB key={i} imageId={imgMatch[1]} />;

        // File marker: [文件:fileId:fileName]
        const fileMatch = part.match(/^\[文件:[^:]+:([^\]]+)\]$/);
        if (fileMatch) return <FileMarker key={i} name={fileMatch[1]} />;

        // Text content
        if (isMarkdown) {
          return (
            <div key={i} className="md-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {part}
              </ReactMarkdown>
            </div>
          );
        }

        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
