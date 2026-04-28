# CLAUDE.md — yapp-ext-projectplanning

Aanvullende instructies voor deze extensie-repo. De algemene workspace-regels uit `Projects EXT/Y-app/CLAUDE.md` en `Dev/CLAUDE.md` blijven gelden, met onderstaande uitzonderingen.

## Git workflow — afwijkend van workspace-default

- **Pushen mag zonder expliciete bevestiging.** Dit is een eigen extensie-repo (niet de Y-app core), losstaand gehost. Branch werk + push is de normale flow; je hoeft niet elke keer te vragen.
- Gebruik wel een branch voor niet-triviaal werk, niet rechtstreeks naar `main` zonder reden.
- Force-push, history rewrites, en `--no-verify` blijven verboden zonder expliciete toestemming.

## Wat de extensie is

Remote-iframe extensie voor Y-app: fase-timeline dashboard voor 3BM-projecten (CLT/VL templates). Wordt gehost op `https://piyton.github.io/yapp-ext-3BMEng-projectplanning/` en geladen in Y-app via de `projectplanning`-entry uit `packages/frontend/src/extensions/catalog.ts` van Y-app.

Communicatie met Y-app gaat via `lib/yappBridge.ts` (postMessage RPC: `fetchList`, `fetchDocument`, `createDocument`, `openProject`, `getActiveInstanceId`, `getErpNextAppUrl`).

## Belangrijke architectuur-keuzes

- **Phase data-flow**: ruwe ERPNext Tasks → `lib/phaseDetection.ts` bouwt `ProjectView` (phases + transitions + adhocTasks) → componenten renderen alleen.
- **FaseTracker** (sinds redesign): nieuwe rail-component vervangt de oude `ProjectRow` + `PhaseTimeline`. Kleur draagt alleen status-betekenis (`actief`/`wachten`/`controle`/`ingepland`/`hold`), niet fase-positie. CSS leeft in `components/faseTracker.css` met tokens onder `.row-card`-scope (geen lekken naar Tailwind/3BM-theming buiten de tracker).
- **Status-mapping**: `lib/faseStatus.ts` mapt bestaande `PhaseStatus` enum naar de tracker-vocabulaire. `phaseDetection.ts` blijft onaangetast.
- **PhaseCarousel** in `expanded-body` toont fase + transitiekaarten, gevoed door `buildCarouselItems` uit `lib/faseTimeline.ts`.

## Build & dev

- `cd` naar deze repo, dan `npx vite` (dev) of `npx vite build` (productie naar `dist/`).
- Type-check: `npx tsc --noEmit`.
- Tailwind blijft beschikbaar voor non-tracker UI; nieuwe tracker-CSS is bewust vendor-loos.
