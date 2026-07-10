# COLOSSAL FURY

A browser-based 1950s creature-feature kaiju arena brawler built with Babylon.js —
an original homage to the golden age of monster-brawler games (think PS2-era city
smashers). All monsters, names, and the map are original creations.

## Run it

```sh
./serve.sh          # then open http://localhost:8000
```

(Any static file server works — ES modules need HTTP, not `file://`. Babylon.js is
vendored in `lib/`, so it runs fully offline.)

## The game

- **1v1 monster duels** against an AI opponent in **Meridian City — Downtown**: a
  ~600×600 m destructible district (5×5 city blocks, central park, dusk skyline).
- **4 original monsters**, each with distinct stats, silhouette, and a signature
  ranged special:
  | Monster | Archetype | Special |
  |---|---|---|
  | RYZOR | balanced reptile titan | Tidal Plasma (3-bolt burst) |
  | MEGATON MK-7 | heavy atomic-age robot | Fist of the Atom (rocket volley) |
  | KRAGMOR | tank magma golem | Caldera Bomb (huge AoE lob) |
  | VESPERA | fast wasp queen (can glide) | Caustic Volley (4-bolt spray) |
- **Destructible city**: buildings break floor-by-floor and collapse into rubble;
  falling debris hurts; collapses drop health/energy pickups.
- **Environmental combat**: grab and hurl cars, buses, trees, the park monument;
  cars explode on impact; getting launched into a building damages both you and it.
- **Climbing**: jump toward any wall and hold toward it to latch on, W/S to climb,
  A/D to strafe, Space to leap off — punch while hanging to wreck the facade.
- **Signature duel camera** that frames both monsters and zooms with separation.

## Controls

| Key | Action |
|---|---|
| WASD | move (camera-relative) |
| Space | jump / double-jump / leap off wall |
| J | light attack (chains ×3) |
| K | heavy attack (launcher); in air: dive slam |
| L | grab car/tree/enemy · press again to throw |
| I | special attack (costs energy) |
| Shift (hold) | block · Shift+direction: dodge (i-frames) |
| P / Esc | pause |

Energy (blue bar) regenerates, builds by dealing/taking damage, and refills from
blue orbs. Green orbs heal. Both spawn at street corners and burst out of
collapsing buildings.

## Code layout

```
index.html          shell, HUD + menu overlays (pure HTML/CSS)
lib/babylon.js      Babylon.js (vendored, offline)
src/main.js         boot, game states, match manager, debug handle (window.__CF)
src/city.js         procedural destructible city, collision queries
src/monsters.js     roster: stats + procedural mesh rigs
src/monster.js      entity: physics, combat state machine, animation
src/ai.js           AI opponent (utility state machine → same intents as player)
src/player.js       keyboard → camera-relative intents
src/camera.js       dual-fighter duel camera with building avoidance
src/projectiles.js  specials + thrown props
src/pickups.js      health/energy orbs
src/effects.js      particles, debris chunks, screen shake
src/audio.js        procedural WebAudio SFX (no assets)
src/hud.js          HTML HUD driver
```

Adding a monster = one def in `src/monsters.js` (stats + mesh builder returning the
shared rig contract). Adding a map = a second City-style module.
