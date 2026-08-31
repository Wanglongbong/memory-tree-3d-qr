# Integration guide

## React + Vite

Copy these starter files into the consuming project:

- `src/MemoryTreeQr.tsx`
- `src/qr.ts`
- the `.memory-tree-*` styles from `src/styles.css`

Install runtime dependencies:

```bash
npm install qrcode three
npm install -D @types/qrcode @types/three
```

Render the component with the final destination:

```tsx
<MemoryTreeQr payload="https://example.com/guestbook" />
```

Keep the `payload` stable while the user is interacting. If an editor lets people type a destination, apply it on submit instead of rebuilding the WebGL scene after every keystroke.

## Existing design systems

Treat the starter CSS as tokens, not a mandatory visual identity. Change the palette, typography, border radius, and surrounding copy to match the application. Do not weaken scan-mode contrast or quiet-zone spacing.

## Other frameworks

Keep `createQrMatrix` framework-independent. Mount Three.js from the framework's client lifecycle, retain one renderer per visible instance, observe container resize, and dispose geometries, materials, animation frames, listeners, and the renderer on unmount.

## Dynamic guestbooks

Encode a stable guestbook URL rather than a snapshot of guest names. The webpage can update as new entries arrive while the physical or embedded QR remains valid.

## Payment QR codes

Use the exact EMV/VietQR payload from a trusted generator or banking source. Do not reconstruct account payloads from visible numbers. Display recipient and amount outside the QR, and verify the decoded payment details in a banking app before release.
