---
name: memory-tree-3d-qr
description: Create, integrate, or adapt an interactive 3D “Cây Ký Ức” (Memory Tree) whose ground plan is a real scannable QR code. Use when a user asks for a 3D/artistic QR, a memory-tree QR scene, a QR diorama, a scan-safe Three.js QR experience, or wants to reuse the Cây Ký Ức concept in a React/Vite website.
---

# Cây Ký Ức QR 3D

Build the experience as two coordinated views of the same QR matrix:

- **Trưng bày 3D:** turn dark modules into landscape, roots, foliage, lanterns, or other themed objects.
- **Quét mã:** move to an exact top-down camera, hide interfering decoration, restore high contrast, and preserve a four-module quiet zone.

Never draw plausible-looking QR pixels by hand. Generate the matrix from the exact final payload with error correction `H`, then render every dark module once.

## Workflow

1. Inspect the target project, framework, existing visual language, and mobile constraints.
2. Confirm or infer the final QR payload. Do not copy account numbers, private identifiers, or URLs from an unrelated example.
3. Start from `assets/starter/` for React + Vite + Three.js projects. It includes three scene themes, client-side QR image decoding, stateless share links, PNG export, and an optional VietQR Vercel Function. Copy only the files needed by the target project.
4. Keep QR topology separate from artistic classification. Styling may change height, material, and decorative surroundings in showcase view; it must not add, remove, merge, or shift modules.
5. Provide a clearly labeled scan-mode control. In scan mode:
   - use an orthographic top-down camera;
   - reset scene rotation;
   - render dark modules in either one near-black color or a scene-derived multicolor palette whose every color meets the contrast requirement;
   - render the background and four-module quiet zone in one uniform light color; this may be a pale scene color rather than white;
   - hide branches, leaves, particles, labels, shadows, gradients, and lights that overlap the code;
   - stop auto-orbit and unnecessary motion.
6. Provide a flat QR fallback and a normal clickable link for accessibility and WebGL failure.
7. Respect `prefers-reduced-motion`, cap device pixel ratio, use pointer events for mouse/touch, and keep controls at least 44 px tall on small screens.
8. Verify the exact payload round trip and test the production-sized rendering on both a narrow portrait viewport and a desktop viewport.
9. When handling uploaded QR images, decode locally and regenerate the matrix from the decoded payload. Never trace pixels from the screenshot.
10. For Vietnamese bank transfers, use a trusted VietQR response payload and keep API credentials server-side. Never infer or invent a payment payload from visible account text.

## Reuse guidance

Read `references/design-contract.md` before changing QR geometry, colors, cameras, or decoration. Read `references/integration.md` when copying the starter into an existing project or adapting it to another framework.

Run `scripts/check_starter.sh` after editing the bundled starter. In a consuming project, run its typecheck/build and test a screenshot or physical display with at least two QR scanners when possible.

## Delivery checklist

- State the encoded payload and confirm it is the intended destination.
- State which view is scan-safe.
- Confirm that the flat fallback decodes to the same payload.
- Report build/typecheck results and any physical scan testing not performed.
- Keep application-specific branding in the consuming project; keep this skill generic and reusable.
