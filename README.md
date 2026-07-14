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

- **Free-for-all brawls** — up to **4 kaiju at once** (you plus AI) in a
  last-monster-standing melee in **Meridian City — Downtown**: a ~600×600 m
  destructible district (5×5 city blocks, central park, dusk skyline). Every swing
  can catch multiple rivals; a KO announces the fall and the fight rolls on until
  one titan remains.
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
tune your monster only, not the AI). Under **PHYSICS** (global — both fighters):
**gravity** in m/s² (default 9.81 = the original tuning; raise it for a heavier,
less-floaty fall), **throw speed** for hurled props (cars/trees/monument), and
**special speed** for energy-attack projectiles. Choices are saved on the device
(localStorage) and reapplied next time. A center **crosshair** marks where you aim.

The GAMEPLAY & PHYSICS rows are **shared match rules** locked behind a password
(default `colossal` — change `SETTINGS_PASSWORD` in `src/settings.js`). Online,
only the room **host** can change them and they apply to everyone; turn
sensitivity, invert, volume and gyro always stay personal to each player.

On phones there's also **gyro steering**: turn on *TILT TO TURN* and lean the phone
left/right to rotate your monster, and *TILT TO LOOK* to tilt it forward/back to aim
up/down. Both axes share one *gyro sensitivity* and each has its own invert (INVERT
HORIZONTAL / VERTICAL), and a *gyro sensitivity* up to 8×. Tilt maps to a *rate* so you can spin a full 360°; "level"
recalibrates each time a fight starts or resumes. iOS asks for motion permission the
first time you enable it, and it needs HTTPS (the live GitHub Pages URL works; some
in-app browsers block the sensor).

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

## Multiplayer (online free-for-all)

Up to four friends can brawl in one arena. The **game** is served from GitHub
Pages as usual, but real-time play needs a small relay server (GitHub Pages
can't host one). A ready-to-deploy Node relay lives in `server/` — see
`server/README.md` for the one-command Fly.io deploy. Then, on the title screen:
**▶ MULTIPLAYER**, paste your `wss://…` server address, and **HOST A GAME** (share
the 4-letter room code) or **JOIN** with a friend's code. Pick monsters, the host
starts, and everyone fights in the same city.

The room **host** runs the authoritative simulation; other players stream their
input up and see the shared battle — monsters, crumbling buildings, specials and
pickups all synced. Shared match rules (gravity, speeds, jump) are host-owned and
password-gated; each player keeps their own turn sensitivity.

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
src/gyro.js         optional gyroscope tilt steering — yaw + pitch (phones)
src/net.js          online multiplayer transport (relay WebSocket client)
src/netghost.js     guest-side ghosts for host-synced projectiles + pickups
src/projectiles.js  specials + thrown props
src/pickups.js      health/energy orbs
src/effects.js      particles, debris chunks, screen shake
src/audio.js        procedural WebAudio SFX (no assets)
src/hud.js          HTML HUD driver
```

Adding a monster = one def in `src/monsters.js` (stats + mesh builder returning the
shared rig contract). Adding a map = a second City-style module.
