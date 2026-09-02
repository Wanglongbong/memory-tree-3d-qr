# Scan-safe design contract

## Source of truth

The final payload is the only source of truth. Generate a fresh matrix with `qrcode` and error correction `H` whenever the payload changes. Do not trace a screenshot or reuse a matrix from another project.

## Layer model

Use three independent layers:

1. **QR layer:** one mesh per dark module, exact integer-grid placement.
2. **Quiet/background layer:** a uniform light plate extending at least four modules beyond every edge.
3. **Story layer:** tree, roots, leaves, lanterns, particles, labels, trains, or other project-specific decoration.

The story layer may overlap the QR only in showcase view. Hide it before the scan transition completes.

## Scan mode invariants

- Orthographic camera, perpendicular to the QR plane.
- No perspective skew, scene rotation, bloom, shadows, fog, gradients, texture, or transparency over the code.
- Every dark-module color has a luminance contrast of at least 4.5:1 against the background. A scene-derived multicolor foreground on one uniform pale background is allowed; protected patterns should use the darkest color.
- Finder, timing, alignment, format, version, and data modules retain identical size and spacing.
- Four-module quiet zone remains empty on every side.
- Entire code stays inside the viewport with padding; no crop beneath browser chrome or safe areas.
- Motion stops while scanning.

## Artistic freedom

In showcase view, classify modules into visual roles without changing the boolean matrix. For example, central dark modules can use autumn-leaf colors, lower modules can resemble roots or landscape, and protected QR structures can use clipped hedges. Decorative geometry can rise above the plane because scan mode removes it.

## Mobile and accessibility

- Use pointer events rather than mouse-only listeners.
- Make every control at least 44 × 44 CSS pixels.
- Cap WebGL DPR at 2 to avoid excessive memory use.
- Support portrait layouts without requiring landscape orientation.
- Honor `prefers-reduced-motion` and pause auto-orbit in scan mode.
- Provide a flat `<img>` QR fallback with useful alt text and a normal anchor to the encoded URL when the payload is a URL.

## Verification

Automated decoding verifies payload integrity, but does not guarantee the 3D canvas is scannable. Test a production screenshot and the real display at expected size, brightness, distance, and browser zoom. If the canvas is unreliable, keep the flat fallback immediately available.
