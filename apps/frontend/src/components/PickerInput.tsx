import type { InputHTMLAttributes, PointerEvent } from 'react';

type PickerType = 'date' | 'time' | 'datetime-local' | 'month' | 'week';

type PickerInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  type: PickerType;
};

/**
 * Native date/time controls open the picker only from the calendar icon.
 * A click on the rest of the field just focuses a segment. Open the picker
 * on pointerdown for the whole field, then cancel that gesture so Chromium
 * does not toggle it shut — both the icon and a parent <label> do that.
 */
export function PickerInput({ type, className, onPointerDown, ...props }: PickerInputProps) {
  return (
    <input
      {...props}
      type={type}
      className={className ? `${className} cursor-pointer` : 'cursor-pointer'}
      onPointerDown={event => {
        onPointerDown?.(event);
        if (!event.defaultPrevented) openPickerFromField(event);
      }}
    />
  );
}

function openPickerFromField(event: PointerEvent<HTMLInputElement>) {
  if (event.button !== 0 || event.pointerType === 'touch') return;

  const input = event.currentTarget;
  if (input.disabled || input.readOnly) return;
  if (typeof input.showPicker !== 'function') return;

  try {
    input.focus({ preventScroll: true });
    input.showPicker();
  } catch {
    // Already open, or the browser rejected the call. Leave the gesture alone
    // so the native control can close the picker.
    return;
  }

  event.preventDefault();
}
