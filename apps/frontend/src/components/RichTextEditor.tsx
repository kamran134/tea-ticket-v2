import { useEffect, useId, useRef, useState } from 'react';
import { descriptionToEditorHtml, isEmptyDescription, sanitizeDescriptionHtml } from '../lib/descriptionHtml';

const EMOJIS = ['🍵', '🫖', '✨', '🌸', '🍃', '🎉', '🔥', '❤️', '😊', '👍', '🌟', '🌙'];

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  compact?: boolean;
}

export function RichTextEditor({ value, onChange, placeholder = 'Описание', compact = false }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const skipSync = useRef(false);
  const emojiId = useId();
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || skipSync.current) {
      skipSync.current = false;
      return;
    }
    const next = descriptionToEditorHtml(value);
    if (el.innerHTML !== next) el.innerHTML = next;
    el.classList.toggle('is-empty', isEmptyDescription(el.innerHTML));
  }, [value]);

  const emit = () => {
    const el = editorRef.current;
    if (!el) return;
    el.classList.toggle('is-empty', isEmptyDescription(el.innerHTML));
    skipSync.current = true;
    onChange(el.innerHTML);
  };

  const run = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    emit();
  };

  const insertEmoji = (emoji: string) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, emoji);
    setEmojiOpen(false);
    emit();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) {
      document.execCommand('insertHTML', false, sanitizeDescriptionHtml(html));
    } else {
      document.execCommand('insertText', false, text);
    }
    emit();
  };

  return (
    <div className={`rich-text-frame ${compact ? 'rich-text-frame--compact' : ''}`}>
      <div className="rich-text-toolbar">
        <button type="button" title="Жирный" aria-label="Жирный" onMouseDown={e => e.preventDefault()} onClick={() => run('bold')}>
          <span className="font-bold">Ж</span>
        </button>
        <button type="button" title="Курсив" aria-label="Курсив" onMouseDown={e => e.preventDefault()} onClick={() => run('italic')}>
          <span className="italic">К</span>
        </button>
        <div className="relative">
          <button
            type="button"
            title="Эмодзи"
            aria-label="Эмодзи"
            aria-expanded={emojiOpen}
            aria-controls={emojiId}
            onMouseDown={e => e.preventDefault()}
            onClick={() => setEmojiOpen(o => !o)}
          >
            😊
          </button>
          {emojiOpen && (
            <div id={emojiId} className="rich-text-emoji-pop" role="listbox">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  role="option"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => insertEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="rich-text-editor is-empty"
        onInput={emit}
        onPaste={onPaste}
        onBlur={() => {
          setEmojiOpen(false);
          const el = editorRef.current;
          if (!el) return;
          const clean = sanitizeDescriptionHtml(el.innerHTML);
          if (el.innerHTML !== clean) el.innerHTML = clean;
          skipSync.current = true;
          onChange(clean);
        }}
      />
    </div>
  );
}
