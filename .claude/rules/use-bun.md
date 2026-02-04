---
# Path filter - loads for TypeScript, JavaScript, and package files
paths:
  - "**/*.{ts,tsx,js,jsx,html,css}"
  - "**/package.json"
  - "package.json"
---

# Always Use Bun Runtime

This project uses **Bun** as the runtime and package manager, not Node.js.

## Package Management

- **ALWAYS use `bun install`** instead of `npm install`, `yarn install`, or `pnpm install`
- **Use `bun add <package>`** instead of `npm install <package>`
- **Use `bun add -d <package>`** for dev dependencies
- **Use `bun run <script>`** instead of `npm run <script>`, `yarn run`, or `pnpm run`
- **Use `bunx <package>`** instead of `npx <package>`

## Runtime

- **ALWAYS use `bun <file>`** instead of `node <file>` or `ts-node <file>`
- **Use `bun test`** instead of `jest` or `vitest`
- **Use `bun build <file>`** instead of `webpack` or `esbuild`
- **Use `bun --hot <file>`** for development with hot reload

## Environment Variables

Bun automatically loads `.env` files. **Do NOT use dotenv** or any other env loader.

## Built-in APIs

Use Bun's built-in APIs instead of external packages:

| Instead of... | Use this... |
|--------------|-------------|
| `express` | `Bun.serve()` |
| `better-sqlite3` | `bun:sqlite` |
| `ioredis` | `Bun.redis` |
| `pg` or `postgres.js` | `Bun.sql` |
| `ws` | `WebSocket` (built-in) |
| `node:fs` readFile/writeFile | `Bun.file()` |
| `execa` | `Bun.$` |

## Frontend

Use HTML imports with `Bun.serve()`. **Do NOT use `vite`**. HTML imports fully support React, CSS, and Tailwind.

### Example Server

```ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  websocket: {
    open: (ws) => ws.send("Hello, world!"),
    message: (ws, message) => ws.send(message),
    close: (ws) => { /* handle close */ }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

### Example HTML

```html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

HTML files can import `.tsx`, `.jsx`, or `.js` files directly. Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import './index.css';  // import .css files directly

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

## Testing

Use `bun test` to run tests:

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Common Mistakes to Avoid

| Don't do this | Do this instead |
|--------------|-----------------|
| `npm install` | `bun install` |
| `npm run dev` | `bun run dev` |
| `npx prisma generate` | `bunx prisma generate` |
| `node server.js` | `bun server.js` |
| `import dotenv from 'dotenv'` | (nothing - .env is auto-loaded) |
| `import express from 'express'` | `Bun.serve()` |
| `vite` | `Bun.serve()` with HTML imports |
