# LeadConvo landing page

Marketing site for LeadConvo. Vite + TypeScript + three.js (r186), no framework.

```bash
npm install
cp .env.example .env   # set VITE_APP_URL to where SaaS_frontend runs
npm run dev            # http://localhost:5173
npm run build          # type-check + production build into dist/
```

## How it's put together

- `index.html` holds all copy. Each `<section data-scene="x y z scale flow heat">` sets the 3D
  pose for that section; scrolling blends between neighbouring poses.
- `src/scene/Experience.ts` sets up the renderer, bloom (EffectComposer → UnrealBloomPass → OutputPass),
  the scroll choreography, pointer ripples and the channel focus.
- `src/scene/Core.ts` is the molten core (noise-displaced sphere, normals rebuilt in the vertex shader).
- `src/scene/Streams.ts` holds one particle stream per channel. Every particle is animated on the GPU.
- `src/scene/Sparks.ts` adds the gold orbit and the background dust.
- `src/scene/palette.ts` holds the brand colours and the channel order. The channel order must match
  `data-channel` in the HTML.

CTAs with `data-app="/path"` link to `VITE_APP_URL + path`. Links with `data-sales` go to `VITE_SALES_URL`.

The scene is loaded as a separate chunk, so the text renders first. Quality drops automatically on small
or low-core devices, `prefers-reduced-motion` slows the scene almost to a still and removes parallax, and
a static gradient replaces the scene if WebGL is unavailable.
