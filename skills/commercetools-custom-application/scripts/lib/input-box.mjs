// The box under a failed or waiting step, as a pure model. A step asks for one value with
// { ctx, label, secret?, options? }: typed text, or a list of { id, name, plan, current } rows to
// pick from. Keys arrive by the names the screens use ('char:x', 'backspace', 'up', 'enter'...).
// reduceInput returns the next box and, on enter, { done: true, value }: the trimmed text (empty
// means "just try again") or the id under the cursor.
export function initInput(spec) {
  const { label, secret, options } = spec;
  return options ? { label, options, cursor: 0 } : { label, secret, value: '' };
}

export function reduceInput(input, name, str) {
  if (input.options) {
    if (name === 'enter') return { input, done: true, value: input.options[input.cursor].id };
    if (name === 'up') return { input: { ...input, cursor: Math.max(0, input.cursor - 1) } };
    if (name === 'down') return { input: { ...input, cursor: Math.min(input.options.length - 1, input.cursor + 1) } };
    return { input };
  }
  if (name === 'enter') return { input, done: true, value: input.value.trim() };
  if (name === 'backspace') return { input: { ...input, value: input.value.slice(0, -1) } };
  if (name === 'ctrl-u') return { input: { ...input, value: '' } };
  if (name === 'space') return { input: { ...input, value: `${input.value} ` } };
  if (name?.startsWith('char:') && str?.length === 1) return { input: { ...input, value: input.value + str } };
  return { input };
}
