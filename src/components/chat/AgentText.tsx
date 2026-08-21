import type { ReactNode } from 'react';

export function AgentText({ content }: { content: string }) {
  const blocks = content.trim().split(/\n{2,}/).filter(Boolean);

  return (
    <div className="agent-text">
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n').filter(Boolean);
        if (lines.every((line) => /^[-*]\s+/.test(line))) {
          return (
            <ul key={blockIndex} className="my-2 list-disc space-y-1 pl-5">
              {lines.map((line, index) => <li key={index}>{inlineText(line.replace(/^[-*]\s+/, ''))}</li>)}
            </ul>
          );
        }
        if (lines.every((line) => /^\d+[.)]\s+/.test(line))) {
          return (
            <ol key={blockIndex} className="my-2 list-decimal space-y-1 pl-5">
              {lines.map((line, index) => <li key={index}>{inlineText(line.replace(/^\d+[.)]\s+/, ''))}</li>)}
            </ol>
          );
        }

        return (
          <p key={blockIndex} className="my-2 first:mt-0 last:mb-0">
            {lines.map((line, index) => (
              <span key={index}>
                {index ? <br /> : null}
                {inlineText(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inlineText(value: string): ReactNode[] {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-slate-950">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
