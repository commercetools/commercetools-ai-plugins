# Server Component Boundaries

Server Components run on the server and render to HTML — they cannot attach JS event listeners. Any prop that is a function (e.g. `onChange`, `onClick`, `onSubmit`) is illegal on a Server Component's JSX. This applies to all interactive elements including — but not limited to — `<select>`, `<input>`, and `<button>`.

**INCORRECT:** Adding an `onChange` handler directly on a `<select>` inside a Server Component.

**CORRECT:** Extract the element with the event listener into a `'use client'` component and pass only plain data props (strings, arrays, objects) to it from the Server Component.

```typescript
// WRONG — Server Component
export default async function LocaleSwitcher() {
  const locales = await getLocales();
  return <select onChange={(e) => switchLocale(e.target.value)}>...</select>;
}

// CORRECT — split into two files
// LocaleSwitcherClient.tsx
'use client';
export default function LocaleSwitcherClient({ locales }: { locales: string[] }) {
  return <select onChange={(e) => switchLocale(e.target.value)}>...</select>;
}

// LocaleSwitcher.tsx (Server Component)
import LocaleSwitcherClient from './LocaleSwitcherClient';
export default async function LocaleSwitcher() {
  const locales = await getLocales();
  return <LocaleSwitcherClient locales={locales} />;
}
```

> The boundary rule: a Server Component can render a Client Component, but cannot pass functions as props across that boundary. Pass data down; let the Client Component own all event handling.
