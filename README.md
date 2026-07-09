# LavaRand Wall

A browser recreation of [Cloudflare's lava-lamp entropy wall](https://www.cloudflare.com/learning/ssl/lava-lamp-encryption/): a wall of simulated lava lamps, photographed by a virtual camera, hashed with SHA-256, and mixed into an entropy pool.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## How it works

1. **Physics (CPU)**: each lamp runs a small blob simulation: heat near the bulb, buoyancy from a density crossover, soft separation, rare merges, and splits. Lamps warm up slowly when switched on and cool when switched off.
2. **Render (WebGL2)**: one fullscreen fragment shader draws every lamp as a tapered glass vessel with a silver base and cap, colored liquid, and metaball wax lit from below.
3. **Camera**: every few seconds (or on demand) the app reads the canvas pixels, SHA-256s them, and mixes the digest into an entropy pool along with frame-timing jitter and mouse noise.
4. **Output**: the pool derives UUIDs, dice rolls, coin flips, and passwords. Click a value in the sidebar to copy it.
