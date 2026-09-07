function isSectionHeading(line: string): boolean {
  return /^\d+\.\s+\S/.test(line) && !/^\d+\.\d+/.test(line);
}

function isListItem(line: string): boolean {
  if (/^\d+\./.test(line)) return false;
  if (line.startsWith('[')) return false;
  return line.endsWith(';');
}

interface Block {
  type: 'h1' | 'h2' | 'p' | 'ul';
  text?: string;
  items?: string[];
}

export function parseLegalBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let titleDone = false;
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ type: 'ul', items: list });
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (!titleDone) {
      blocks.push({ type: 'h1', text: line });
      titleDone = true;
      continue;
    }
    if (isListItem(line)) {
      list.push(line.replace(/;$/, ''));
      continue;
    }
    flushList();
    if (isSectionHeading(line)) {
      blocks.push({ type: 'h2', text: line });
    } else {
      blocks.push({ type: 'p', text: line });
    }
  }
  flushList();
  return blocks;
}

export function LegalDocument({ text }: { text: string }) {
  const blocks = parseLegalBlocks(text);

  return (
    <div className="legal-doc space-y-4 text-[15px] leading-relaxed text-gray-700">
      {blocks.map((block, i) => {
        if (block.type === 'h1') {
          return (
            <h1 key={i} className="text-2xl sm:text-3xl font-bold text-emerald-800 tracking-tight text-center">
              {block.text}
            </h1>
          );
        }
        if (block.type === 'h2') {
          return (
            <h2 key={i} className="pt-4 text-lg font-semibold text-gray-800">
              {block.text}
            </h2>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {block.items!.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{block.text}</p>;
      })}
    </div>
  );
}
