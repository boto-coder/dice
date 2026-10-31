# Dice Roller

A 3D physics dice roller for tabletop RPGs and board games. See [REQUIREMENTS.md](REQUIREMENTS.md).

## Setup

```sh
npm install
npx playwright install chromium   # first time only, for e2e tests
```

## Commands

| Command              | What it does                                                |
| -------------------- | ----------------------------------------------------------- |
| `npm run dev`        | Start the dev server at http://localhost:5173               |
| `npm run build`      | Type-check and build to `dist/`                             |
| `npm run preview`    | Serve the production build at http://localhost:4173         |
| `npm test`           | Full suite: typecheck, lint, format check, unit + e2e tests |
| `npm run test:unit`  | Vitest unit/DOM tests with coverage                         |
| `npm run test:watch` | Vitest in watch mode                                        |
| `npm run test:e2e`   | Playwright end-to-end tests (desktop + mobile viewports)    |
| `npm run lint`       | ESLint                                                      |
| `npm run format`     | Format all files with Prettier                              |
