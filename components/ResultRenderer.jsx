'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

// ── Export helpers ───────────────────────────────────────

async function exportPDF(svgElement, fileName) {
  if (!svgElement) return;
  const { jsPDF } = await import('jspdf');
  const { svg2pdf } = await import('svg2pdf.js');
  const rect = svgElement.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;
  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width + 40, height + 40],
  });
  await svg2pdf(svgElement, pdf, { x: 20, y: 20, width, height });
  pdf.save(fileName + '.pdf');
}

async function exportPNG(svgElement, fileName) {
  if (!svgElement) return;
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const scale = 2;
  const rect = svgElement.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);

  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  });

  const link = document.createElement('a');
  link.download = fileName + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── Copy button ──────────────────────────────────────────

function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`text-xs transition-all duration-200 ${
        copied
          ? 'text-green-400'
          : 'text-zinc-500 hover:text-zinc-300'
      } ${className}`}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </span>
      )}
    </button>
  );
}

// ── MermaidDiagram: self-contained render + export ───────

function MermaidDiagram({ code, fileName }) {
  const containerRef = useRef(null);
  const [svgRef, setSvgRef] = useState(null);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(null);
  const idRef = useRef('mermaid-' + Math.random().toString(36).slice(2, 9));

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    async function render() {
      try {
        const { svg } = await mermaid.render(idRef.current, code);
        if (cancelled) return;
        containerRef.current.innerHTML = svg;
        const svgEl = containerRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
          setSvgRef(svgEl);
        }
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code]);

  async function handleExportPDF() {
    if (!svgRef || exporting) return;
    setExporting('pdf');
    try { await exportPDF(svgRef, fileName); }
    finally { setExporting(null); }
  }

  async function handleExportPNG() {
    if (!svgRef || exporting) return;
    setExporting('png');
    try { await exportPNG(svgRef, fileName); }
    finally { setExporting(null); }
  }

  return (
    <div className="my-4 not-prose">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500 font-medium">📊 Diagram</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPDF}
            disabled={!svgRef || !!exporting}
            className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700
                       rounded-lg px-2.5 py-1 hover:bg-zinc-800 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {exporting === 'pdf' ? '⏳' : '📄'} PDF
          </button>
          <button
            onClick={handleExportPNG}
            disabled={!svgRef || !!exporting}
            className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700
                       rounded-lg px-2.5 py-1 hover:bg-zinc-800 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {exporting === 'png' ? '⏳' : '🖼️'} PNG
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex justify-center overflow-x-auto bg-zinc-900/50 rounded-xl
                   border border-zinc-800 p-4"
      />
      {error && (
        <p className="mt-2 text-xs text-red-400 font-mono bg-red-950/20 rounded p-2">
          Diagram error: {error}
        </p>
      )}
    </div>
  );
}

// ── Section icons and colors ────────────────────────────

const SECTION_STYLES = {
  'Architecture Overview': { icon: '🏗️', color: 'blue' },
  'System Design': { icon: '🔧', color: 'blue' },
  'Data Flow': { icon: '🔄', color: 'cyan' },
  'Data Model': { icon: '🗃️', color: 'purple' },
  'Component Breakdown': { icon: '🧩', color: 'amber' },
  'Why This Architecture': { icon: '💡', color: 'green' },
  'What We Deliberately Avoided': { icon: '🚫', color: 'red' },
  'Where This Will Struggle': { icon: '⚠️', color: 'amber' },
  'My Recommendation': { icon: '⭐', color: 'green' },
  'What I See': { icon: '🔍', color: 'blue' },
  'Issues Found': { icon: '🐛', color: 'red' },
  'Current Pattern vs Recommended': { icon: '🔄', color: 'purple' },
  'Restructuring Plan': { icon: '📋', color: 'green' },
  'What The Community Says': { icon: '🌐', color: 'cyan' },
  'Option': { icon: '💠', color: 'blue' },
};

function getSectionStyle(heading) {
  for (const [key, style] of Object.entries(SECTION_STYLES)) {
    if (heading.includes(key)) return style;
  }
  return { icon: '📌', color: 'zinc' };
}

const COLOR_MAP = {
  blue: { border: 'border-blue-500/20', bg: 'bg-blue-500/5', text: 'text-blue-400', badge: 'bg-blue-500/10 text-blue-400' },
  cyan: { border: 'border-cyan-500/20', bg: 'bg-cyan-500/5', text: 'text-cyan-400', badge: 'bg-cyan-500/10 text-cyan-400' },
  purple: { border: 'border-purple-500/20', bg: 'bg-purple-500/5', text: 'text-purple-400', badge: 'bg-purple-500/10 text-purple-400' },
  amber: { border: 'border-amber-500/20', bg: 'bg-amber-500/5', text: 'text-amber-400', badge: 'bg-amber-500/10 text-amber-400' },
  green: { border: 'border-green-500/20', bg: 'bg-green-500/5', text: 'text-green-400', badge: 'bg-green-500/10 text-green-400' },
  red: { border: 'border-red-500/20', bg: 'bg-red-500/5', text: 'text-red-400', badge: 'bg-red-500/10 text-red-400' },
  zinc: { border: 'border-zinc-700', bg: 'bg-zinc-800/30', text: 'text-zinc-300', badge: 'bg-zinc-700 text-zinc-300' },
};

// ── Collapsible Section ─────────────────────────────────

function Section({ heading, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const style = getSectionStyle(heading);
  const colors = COLOR_MAP[style.color];

  // Highlight recommendation section specially
  const isRecommendation = heading.includes('My Recommendation') || heading.includes('Recommendation');
  const isWarning = heading.includes('Struggle') || heading.includes('Avoided');

  return (
    <div className={`my-4 rounded-xl border ${colors.border} overflow-hidden ${
      isRecommendation ? 'ring-1 ring-green-500/30' : ''
    }`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800/50 ${
          open ? colors.bg : 'bg-zinc-900/30'
        }`}
      >
        <span className="text-lg shrink-0">{style.icon}</span>
        <span className={`text-sm font-semibold flex-1 ${colors.text}`}>
          {heading}
        </span>
        {isRecommendation && (
          <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full font-medium">
            Recommended
          </span>
        )}
        {isWarning && (
          <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-medium">
            Important
          </span>
        )}
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform duration-200 shrink-0 ${
            open ? 'rotate-180' : ''
          }`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className={`px-4 pb-4 pt-1 ${colors.bg}`}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Parse content into sections ─────────────────────────

function parseIntoSections(content) {
  // Split by h2 (##) or h3 (###) headings
  const lines = content.split('\n');
  const sections = [];
  let currentHeading = null;
  let currentContent = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headingMatch) {
      // Save previous section
      if (currentHeading || currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Don't forget the last section
  if (currentHeading || currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }

  return sections;
}

// ── Markdown components with enhanced rendering ─────────

function createMarkdownComponents(fileName) {
  return {
    code({ className, children }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).trim();

      if (match && match[1] === 'mermaid') {
        return <MermaidDiagram code={codeString} fileName={fileName} />;
      }

      // Code block with copy button and language badge
      if (match) {
        return (
          <div className="relative group not-prose my-3">
            <div className="flex items-center justify-between bg-zinc-800 rounded-t-lg px-3 py-1.5 border border-zinc-700 border-b-0">
              <span className="text-xs text-zinc-500 font-mono">{match[1]}</span>
              <CopyButton text={codeString} />
            </div>
            <pre className="!mt-0 !rounded-t-none">
              <code className={className}>{children}</code>
            </pre>
          </div>
        );
      }

      // Inline code
      return <code className={className}>{children}</code>;
    },

    // Better table rendering
    table({ children }) {
      return (
        <div className="my-3 overflow-x-auto rounded-lg border border-zinc-700 not-prose">
          <table className="w-full text-sm text-left text-zinc-300">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="text-xs text-zinc-400 uppercase bg-zinc-800/80">{children}</thead>;
    },
    th({ children }) {
      return <th className="px-4 py-2.5 font-semibold">{children}</th>;
    },
    td({ children }) {
      return <td className="px-4 py-2 border-t border-zinc-800">{children}</td>;
    },

    // Blockquote as callout
    blockquote({ children }) {
      return (
        <div className="my-3 flex gap-3 bg-blue-500/5 border border-blue-500/20 rounded-lg px-4 py-3 not-prose">
          <span className="text-blue-400 text-lg shrink-0">💡</span>
          <div className="text-sm text-zinc-300 [&>p]:m-0">{children}</div>
        </div>
      );
    },

    // Bold text within "Issue:" pattern → render as issue badge
    strong({ children }) {
      const text = String(children);
      if (text.startsWith('Issue:') || text.startsWith('Issue ')) {
        return (
          <span className="inline-flex items-center gap-1.5 text-red-400 font-semibold">
            <span className="w-2 h-2 bg-red-400 rounded-full shrink-0"></span>
            {children}
          </span>
        );
      }
      if (text.startsWith('Choose this when:')) {
        return <span className="text-green-400 font-semibold">✅ {children}</span>;
      }
      if (text.startsWith('Avoid this when:')) {
        return <span className="text-red-400 font-semibold">🚫 {children}</span>;
      }
      return <strong>{children}</strong>;
    },

    // Better horizontal rules
    hr() {
      return <hr className="my-4 border-zinc-800" />;
    },
  };
}

// ── Section Table of Contents ───────────────────────────

function TableOfContents({ sections }) {
  if (sections.filter(s => s.heading).length < 3) return null;

  return (
    <div className="mb-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-3">
      <div className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">
        In this response
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sections.filter(s => s.heading).map((section, i) => {
          const style = getSectionStyle(section.heading);
          const colors = COLOR_MAP[style.color];
          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ${colors.badge}`}
            >
              {style.icon} {section.heading}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ResultRenderer ───────────────────────────────────

export default function ResultRenderer({ content, projectName }) {
  const fileName = (projectName || 'architecture') + '-' + new Date().toISOString().slice(0, 10);
  const sections = parseIntoSections(content);
  const hasSections = sections.filter(s => s.heading).length >= 2;
  const components = createMarkdownComponents(fileName);

  // If the content has clear sections, render them in collapsible cards
  if (hasSections) {
    return (
      <div>
        <TableOfContents sections={sections} />
        {sections.map((section, i) => {
          if (!section.content && !section.heading) return null;

          // Preamble text before any heading
          if (!section.heading) {
            return (
              <div key={i} className="prose prose-invert prose-sm max-w-none mb-3
                        prose-headings:text-zinc-200 prose-p:text-zinc-300
                        prose-strong:text-zinc-200 prose-code:text-amber-400
                        prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5
                        prose-code:rounded prose-code:before:content-none
                        prose-code:after:content-none prose-pre:bg-zinc-900
                        prose-pre:border prose-pre:border-zinc-700
                        prose-li:text-zinc-300 prose-a:text-blue-400
                        prose-blockquote:border-zinc-600 prose-blockquote:text-zinc-400
                        prose-hr:border-zinc-700">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                  {section.content}
                </ReactMarkdown>
              </div>
            );
          }

          return (
            <Section key={i} heading={section.heading} defaultOpen={i < 6}>
              <div className="prose prose-invert prose-sm max-w-none
                        prose-headings:text-zinc-200 prose-p:text-zinc-300
                        prose-strong:text-zinc-200 prose-code:text-amber-400
                        prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5
                        prose-code:rounded prose-code:before:content-none
                        prose-code:after:content-none prose-pre:bg-zinc-900
                        prose-pre:border prose-pre:border-zinc-700
                        prose-li:text-zinc-300 prose-a:text-blue-400
                        prose-blockquote:border-zinc-600 prose-blockquote:text-zinc-400
                        prose-hr:border-zinc-700">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                  {section.content}
                </ReactMarkdown>
              </div>
            </Section>
          );
        })}
      </div>
    );
  }

  // Simple content — render as before
  return (
    <div className="prose prose-invert prose-sm max-w-none
                    prose-headings:text-zinc-200
                    prose-p:text-zinc-300
                    prose-strong:text-zinc-200
                    prose-code:text-amber-400
                    prose-code:bg-zinc-800
                    prose-code:px-1.5
                    prose-code:py-0.5
                    prose-code:rounded
                    prose-code:before:content-none
                    prose-code:after:content-none
                    prose-pre:bg-zinc-900
                    prose-pre:border
                    prose-pre:border-zinc-700
                    prose-li:text-zinc-300
                    prose-a:text-blue-400
                    prose-blockquote:border-zinc-600
                    prose-blockquote:text-zinc-400
                    prose-hr:border-zinc-700">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
