# COLOSSAL FURY — relay server

A tiny Node WebSocket relay that lets browsers play the online free-for-all
together. It runs **no game logic**: one player per room is the authoritative
host (their browser runs the full simulation); the server just routes messages
and tracks rooms / who is host.

## Run locally

```sh
cd server
npm install          # once (installs ws)
node server.js       # → [fury-relay] listening on :8090
```

The game client defaults to `ws://localhost:8090`, so with the static site
served (`../serve.sh`) you can open two browser tabs, HOST in one, JOIN in the
other, and play.

## Deploy to Fly.io

```sh
curl -L https://fly.io/install.sh | sh    # install flyctl (once)
fly auth login                            # opens a browser

cd server
fly launch      # detects the Dockerfile; pick a UNIQUE app name + a nearby
                # region, say NO to databases/Redis, keep the existing fly.toml
fly deploy
```

Your relay is then reachable at **`wss://YOUR-APP.fly.dev`**. In the game's
MULTIPLAYER lobby, paste that into the **SERVER** field (it's saved on the
device). Confirm it's up with `fly logs` → `[fury-relay] listening on :8080`.

## Protocol (JSON per message, `t` = type)

| Client → server | Server → client |
|---|---|
| `create` / `join` / `pick` / `ready` | `welcome` / `roster` |
| `start` (host) | `start {order}` |
| `state` (host, ~15 Hz) | `state` → guests |
| `input` (guest, ~30 Hz) | `input` → host (tagged `from`) |
| `settings` (host) | `settings` → guests |
| `bye` / disconnect | `host` (migration) / `peerleft` / `error` |

4 players per room; the host is the first joiner and migrates to the next
client if it leaves.
