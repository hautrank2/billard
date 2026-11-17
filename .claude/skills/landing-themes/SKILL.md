---
name: landing-themes
description: Use when adding or modifying the /showcase software-company landing page, its theme presets, or the configuration used for customer demos.
---

# Landing themes

Read `CLAUDE.md` and `.claude/themes/README.md` first.
Edit `.claude/themes/landing.json` for company copy and theme presets. Do not
duplicate those values in JSX or CSS. Keep theme IDs stable for shared links.
Each preset defines colors, font, radius, layout, visual style and hero copy. New presets
using existing layouts require only a JSON change. New layout variants also
need a CSS module selector and an update to the schema in `type.ts`.
Keep UI in `index.tsx`, URL and switch logic in `hook.ts`, types/schema in `type.ts`.
Validate JSON with the Zod schema on the server before rendering.
Keep theme controls keyboard accessible and the selected state explicit.
Six self-hosted fonts are loaded in the showcase layout. Preserve their OFL licenses.
All theme routes `/showcase/<id>` are generated from configuration, with 404 for unknown IDs.
Preserve legacy `?theme=<id>` links. Verify desktop/mobile, direct URLs, refresh,
back/forward, keyboard selection, Copy link, Motion off, and reduced-motion CSS.
Animation must never prevent reading or interacting with page content.
