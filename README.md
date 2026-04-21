# Y-app extension: Projectplanning

Projectplanning-dashboard voor 3BM Engineering. Loopt als Y-app extension (iframe) die via de Y-app host-bridge ERPNext-data leest.

## Wat het doet

- Fase-timeline per project met grote bollen per CLT/VL-fase (Start → SO → VO → DO → TO → UO)
- Overgangsbollen ⟷ tussen fases met controle- en startinfo-items
- Carousel-detail bij klik op een bol: fase-werk / subtasks / checklist, of overgangs-Controle + Startinformatie
- On-hold detectie (geen timesheet/task-activiteit > 28 dagen)
- Urgentie-score sortering binnen buckets
- 3BM huisstijl (violet header, teal accent, Segoe UI)

## Architectuur

Dit is een statische React-site (Vite build) die geladen wordt in een iframe binnen Y-app. ERPNext-calls gaan via postMessage RPC naar de Y-app parent (`packages/frontend/src/components/ExtensionHost.tsx`):

```
iframe → parent   { id, type: "yapp-ext.rpc", method: "fetchList", args: ["Task", {...}] }
parent → iframe   { id, type: "yapp-ext.rpc.reply", ok: true, result: [...] }
```

Zie [`src/lib/yappBridge.ts`](src/lib/yappBridge.ts) voor de client.

### Data-model

`src/lib/phaseDetection.ts` herkent drie task-rollen binnen een project:

- **Fase-task** — top-level, subject matcht `^([0-9])_(CLT|VL)\s+([A-Za-z]+)…` (bv. `2_CLT VO Voorlopig Ontwerp`)
- **Overgangs-task** — top-level, subject matcht `^Overgang\s+([A-Za-z]+)→([A-Za-z]+)\s+\((CLT|VL)\)$` (bv. `Overgang VO→DO (CLT)`)
- **Nabrander-subtask** — `parent_task` is gezet op een fase- of overgangs-task. Optionele prefix `CTRL:` of `START:` voor categorisering binnen overgangs-context.

Description-HTML (Quill-format) wordt geparsed op `<h3>` / `<h4>` sectie-headers (canoniek: `Start vereiste` / `Controle` / `Tekenwerk`) en `<li data-list="checked|unchecked">` items.

## Ontwikkelen

```bash
cd yapp-ext-projectplanning
npm install
npm run dev      # http://localhost:5174
```

Voor lokaal testen in Y-app: voeg tijdelijk een catalog-entry toe met `url: "http://localhost:5174/"`.

## Build + deploy

```bash
npm run build    # dist/
```

GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) bouwt en deployt naar GitHub Pages bij push naar `main`. URL wordt `https://piyton.github.io/Y_App-extension-projectplanning/`.

## Inschrijven in Y-app

Voeg onderstaande entry toe aan `packages/frontend/src/extensions/catalog.ts` in de Y-app repo:

```ts
{
  id: "projectplanning",
  name: "Projectplanning",
  description: "Fase-timeline dashboard voor CLT/VL projecten met controle- en startinfo-overgangen.",
  url: "https://piyton.github.io/Y_App-extension-projectplanning/",
  sidebarSection: "TAKEN & PLANNING",
  author: "3BM Engineering",
}
```

Daarna verschijnt de extension in Y-app onder Settings → Extensions. Employer kan per instance aanvinken; de pagina komt in de sidebar-sectie "Taken & Planning".

## Pilot-project 2821

Het pilot-project `2821 JM25-041 FastNED Velder Shop` in ERPNext heeft:

- 6 CLT fase-tasks (TASK-2025-00301 t/m 00306)
- 5 overgangs-tasks (TASK-2026-00312 t/m 00316) met `⚠ GEEN UREN BOEKEN` waarschuwing
- 2 `[PILOT TEST]` nabrander-subtasks onder VO en DO

Zie `../erpnext/backups/pilot_2821_pre_*.json` voor de pre-state backup.

## Iteratie 3 — single active phase + UI polish

- **Eén actieve fase tegelijk**: `Task.status = "Working"` = actief. De extensie bewaakt dat visueel: als ERPNext per ongeluk twee fases op `Working` heeft, wordt alleen de eerste in volgorde als actief getoond.
- **Start deze fase**-knop in een fase-blok zet die fase op `Working`; als een andere fase al `Working` was, wordt die (na bevestiging) op `Completed` gezet.
- **Status-dropdown** per fase (Open / Working / Pending Review / Overdue / Completed / Cancelled) — handmatige override via ERPNext Task.status.
- **Compacte timeline** toont altijd welke fase actief is (ook bij ingeklapte rij). De tweede expanded timeline is verwijderd; de compacte bolletjes-rij is leidend.
- **Bolletjes iets groter** (26px compact), **badge** met open-count toont nu óók op fase-bollen (voorheen alleen op overgangen) en overlapt niet meer.

## Iteratie 2 — features

Dashboard biedt nu:

- **Instellingen** (tandwiel rechtsboven): filter op ERPNext Company, project-statussen, urgentie-drempels (rood/oranje in dagen), overgang-bron, deadline-chip aan/uit. Per Y-app instance opgeslagen in `localStorage`.
- **Afvinken + bewerken** van subtasks direct in de carousel (checkbox + potlood → inline edit). Wijziging wordt via `updateDocument("Task", ...)` weggeschreven met optimistic UI; bij fout rolt de lokale state terug en verschijnt er een toast.
- **Klik op projectrij** → opent direct carousel op de eerste open fase (actief → klaar-voor-start → pending).
- **Eigen sub-stijl** voor subtasks in de carousel: linker-streep, lichtpaarse achtergrond, kleine `CTRL` / `START` pill.
- **Kritiek pad**: fase-bollen krijgen een rode/oranje ring op basis van `Task.exp_end_date` t.o.v. drempels. In de fase-detail staat `nog Xd` of `Xd te laat`.
- **Deadline-chip per projectrij** met de eerstvolgende fase-deadline + een strip met tot 3 urgente taken (klikbaar; springt naar die fase in carousel). Assignees worden getoond als voornaam (opgehaald uit `User.full_name`).

### Overgang-bron: dedicated vs merged

Instelbaar in het settings-panel:

- **Dedicated (default, nieuw)** — overgangs-task toont alleen zijn eigen `description`-items en eigen subtasks. Fase-controle-items en fase-startvereiste-items blijven in de fase-tab. Geen dubbele state: afvinken in de overgangs-task verandert niet de fase-task en andersom.
- **Merged (oud gedrag)** — overgangs-task krijgt er `controle` uit de vorige fase-task en `start vereiste` uit de volgende fase-task bij. Handig als overgangs-tasks nog geen eigen description hebben, maar fragiel: ontbreekt er een sectie in de fase-task dan valt een rij uit de overgang; een edit in de fase-task muteert de overgang mee op een manier die soms onverwacht is.

Bij migratie van bestaande projecten: zet eerst op `merged` zodat alles zichtbaar blijft, vul de overgangs-tasks met eigen items, en flip dan naar `dedicated`.

## Pilot-scope: wat dit (nog) NIET doet

- Geen template-wijziging in ERPNext
- Geen email/folder-monitoring
- Geen standaard-doorlooptijden per fase
- Inline edit van checklist-items in `description` (alleen subtask-subjects)
- Overgangs-tasks meenemen in "urgente taken" strip (alleen fase-taken)

## Status

Iteratie 2 — filters, afvinken, kritiek pad. Volgende iteratie kan kijken naar ERPNext-template wijziging, email-koppeling, doorlooptijd-analyse.
