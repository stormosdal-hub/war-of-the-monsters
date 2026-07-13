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
- **FPS-style follow camera**: the mouse turns your monster and the camera rides
  directly behind it, so you aim melee, specials, grabs and throws by facing —
  click the arena to capture the pointer, Esc to release.

## Controls

| Key | Action |
|---|---|
| Mouse | turn & aim your monster (FPS-style) — click the arena to capture the pointer, move X to turn, Y to tilt the view, Esc to release |
| WASD | move relative to facing (W = forward) |
| Space | jump / double-jump / leap off wall |
| J | light attack (chains ×3) |
| K | heavy attack (launcher); in air: dive slam |
| L | grab car/tree/enemy · press again to throw |
| I | special attack (costs energy) |
| Shift (hold) | block · Shift+direction: dodge (i-frames) |
| P / Esc | pause |

**Settings** (⚙ on the title screen, or SETTINGS in the pause menu) let you adjust
**turn sensitivity** (mouse *and* touch drag-to-aim, up to 6×), **invert look (Y)**,
**volume**, and — under GAMEPLAY — **movement speed** and **jump height** (these
tune your monster only, not the AI). Choices are saved on the device (localStorage)
and reapplied next time.

On phones there's also **gyro steering**: turn on *TILT TO TURN* and lean the phone
left/right to rotate your monster (with its own sensitivity + invert). Tilt maps to
a *turn rate* so you can spin a full 360°; "level" recalibrates each time a fight
starts or resumes. iOS asks for motion permission the first time you enable it, and
it needs HTTPS (the live GitHub Pages URL works; some in-app browsers block the
sensor).

Energy (blue bar) regenerates, builds by dealing/taking damage, and refills from
blue orbs. Green orbs heal. Both spawn at street corners and burst out of
collapsing buildings.

### On a phone

Touch devices are auto-detected and get on-screen controls: a left thumbstick to
move, drag the right half of the screen to turn/aim (FPS-style), and a button
cluster for jump, light, heavy, grab, special and block — hold **BLOCK** while
pushing a direction to dodge. Tap to start, tap a monster to pick it. Best played
in landscape (a prompt nudges you to rotate).

For a full-screen experience without the browser's address bar, **add the page to
your home screen** and launch it from there — a web app manifest + iOS meta tags
make it open like a native app. (If you added it before this was in place, remove
the old icon and re-add it so the new settings take effect.)

## Code layout

```
index.html          shell, HUD + menu overlays (pure HTML/CSS)
lib/babylon.js      Babylon.js (vendored, offline)
src/main.js         boot, game states, match manager, debug handle (window.__CF)
src/city.js         procedural destructible city, collision queries
src/monsters.js     roster: stats + procedural mesh rigs
src/monster.js      entity: physics, combat state machine, animation
src/ai.js           AI opponent (utility state machine → same intents as player)
src/player.js       keyboard/touch → camera-relative intents
src/camera.js       FPS-style follow camera (mouse/touch aim), building avoidance
src/touch.js        on-screen touch controls for phones/tablets
src/settings.js     player settings (look/audio/gameplay/gyro) + localStorage
src/gyro.js         optional gyroscope tilt-to-turn steering (phones)
src/projectiles.js  specials + thrown props
src/pickups.js      health/energy orbs
src/effects.js      particles, debris chunks, screen shake
src/audio.js        procedural WebAudio SFX (no assets)
src/hud.js          HTML HUD driver
```

Adding a monster = one def in `src/monsters.js` (stats + mesh builder returning the
shared rig contract). Adding a map = a second City-style module.
