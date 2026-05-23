# Lost-in-code-game
# 🎮 3D Browser Game — Three.js Game SDK

A modular, production-ready game controller toolkit built on top of [Three.js](https://threejs.org/), designed for 3D browser games with real-time multiplayer support.

## 📦 Modules

### `PlayerController`
Full-featured third-person player controller with:
- Keyboard (WASD + Space/Shift/F) and virtual joystick input
- Idle / Walk / Run / Jump / Attack animation state machine with smooth crossfading
- Gravity, ground snapping, wall collision detection via raycasting
- Customizable key bindings, move speed, jump force, and fall reset
- FBX animation loading with per-instance or shared clip support

### `EnemyController`
Autonomous enemy AI with three behavioral states:
- **Patrol** — wanders randomly within a configurable radius
- **Chase** — pursues the player on detection
- **Attack** — triggers melee or ranged callbacks at close range
- Shared FBX animation loading (loaded once, reused across all instances)
- Ground and wall collision via raycasting
- Fully configurable detection range, attack range, cooldown, and speed

### `CameraEffects`
Juicy screen-space effects rendered on an orthographic HUD layer:
- **Camera shake** — configurable amplitude, decay, wave frequencies, and positional/rotational influence
- **Vignette** — animated red edge glow triggered on damage (GLSL shader-based)
- **Blood splats** — 8-slot corner/edge splat system with fade-in/out lifecycle

### `KokoRealtimeSDK` (`networking_sdk.js`)
Lightweight real-time multiplayer networking layer built on [Supabase Realtime](https://supabase.com/docs/guides/realtime):
- Channel-based pub/sub broadcasting
- Presence tracking (who's online)
- Automatic reconnection with exponential backoff
- Simple `join` / `send` / `on` / `leave` API

## 🚀 Quick Start

```js
import { PlayerController } from './player-controller.js';
import { EnemyController }  from './enemy-controller.js';
import { CameraEffects }    from './camera-effects.js';
import KokoRealtimeSDK      from './networking_sdk.js';

// Player
const player = new PlayerController(characterMesh);
await player.loadAnimations();

// Enemy
const enemy = new EnemyController(enemyMesh);
enemy.setPlayer(player.character);
await enemy.init();

// Camera FX
const fx = new CameraEffects(perspCamera, renderer);
fx.triggerShake();
fx.triggerVignette();

// Networking
const net = new KokoRealtimeSDK();
await net.init();
net.join('game-room', { presenceMeta: { name: 'Player1' } });
net.send('game-room', 'move', { x: 1, z: 3 });
```

## 🛠 Tech Stack
- [Three.js](https://threejs.org/) — 3D rendering
- [FBXLoader](https://threejs.org/docs/#examples/en/loaders/FBXLoader) — character animation loading
- [Supabase Realtime](https://supabase.com/docs/guides/realtime) — multiplayer networking
- Vanilla ES Modules — no bundler required
