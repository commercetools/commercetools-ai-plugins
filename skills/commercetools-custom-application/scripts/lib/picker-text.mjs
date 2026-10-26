// Wording and emphasis for the filter box, kept apart from the terminal code so both are testable.

// Says what to type and how to search for several things, with no jargon.
export const PLACEHOLDER = 'Find an Organization or project. Use commas for several.';

export const INSERT_HINT = [['type', 'to search'], ['esc/enter', 'back to normal mode'], ['tab', 'continue']];

// What the user typed is bold and the placeholder is gray italic, so typed text always reads as
// the stronger of the two. `st` is the object from createStyle.
export const inputStyle = (st) => (t) => st.bold(t);
export const placeholderStyle = (st) => (t) => st.gray(st.italic(t));
