// Unified input: keyboard + mouse (pointer lock) on desktop, twin-stick style
// touch on phones. Produces one normalised state object the game reads.

import { clamp } from './math.js';

export const isTouchDevice = () =>
  ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.state = {
      moveX: 0, moveY: 0,
      lookX: 0, lookY: 0,
      attack: false,
      jump: false,
      sprint: false,
      skills: [false, false, false, false],
      pause: false,
    };
    this.keys = new Set();
    this.pointerLocked = false;
    this.touch = {
      moveId: null, moveOX: 0, moveOY: 0, moveX: 0, moveY: 0,
      lookId: null, lookX: 0, lookY: 0,
      buttons: new Map(),   // pointerId -> button name
    };
    this.buttonHits = new Set();  // named virtual buttons pressed this frame
    this.heldButtons = new Set();
    this.enabled = false;
    this.pointerLockBlocked = false;
    this.dragLook = false;
    this._bind();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.reset();
  }

  reset() {
    const s = this.state;
    s.moveX = s.moveY = s.lookX = s.lookY = 0;
    s.attack = s.jump = s.sprint = false;
    s.skills = [false, false, false, false];
    this.keys.clear();
    this.heldButtons.clear();
    this.touch.moveId = this.touch.lookId = null;
    this.touch.moveX = this.touch.moveY = 0;
  }

  _bind() {
    const c = this.canvas;

    // --- Keyboard --------------------------------------------------------
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (k === 'Digit1') this.state.skills[0] = true;
      if (k === 'Digit2') this.state.skills[1] = true;
      if (k === 'Digit3') this.state.skills[2] = true;
      if (k === 'Digit4') this.state.skills[3] = true;
      if (k === 'KeyQ') this.state.skills[0] = true;
      if (k === 'KeyE') this.state.skills[1] = true;
      if (k === 'KeyR') this.state.skills[2] = true;
      if (k === 'KeyF') this.state.skills[3] = true;
      if (k === 'Escape') this.state.pause = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    // --- Mouse -----------------------------------------------------------
    // Pointer lock is the preferred desktop control, but it is unavailable in
    // an iframe without allow="pointer-lock" and can be refused outright. When
    // that happens the game falls back to drag-to-look: hold the left button
    // and move. Without the fallback a refused lock means the player can never
    // look or attack, because every click just retries the lock.
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || isTouchDevice()) return;
      if (!this.pointerLocked && !this.pointerLockBlocked) {
        this.tryPointerLock();
        // Still register the press, so a refused lock is not a dead click.
      }
      if (e.button === 0) {
        this.mouseDown = true;
        this.dragLook = !this.pointerLocked;
        this.dragX = e.clientX;
        this.dragY = e.clientY;
      }
      if (e.button === 2) this.state.sprint = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouseDown = false; this.dragLook = false; }
      if (e.button === 2) this.state.sprint = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === c;
      if (this.pointerLocked) this.pointerLockBlocked = false;
      if (!this.pointerLocked && this.onPointerUnlock) this.onPointerUnlock();
    });
    document.addEventListener('pointerlockerror', () => {
      this.pointerLockBlocked = true;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      const s = this.settings.sensitivity;
      const inv = this.settings.invertY ? -1 : 1;
      if (this.pointerLocked) {
        this.state.lookX += (e.movementX || 0) * 0.0022 * s;
        this.state.lookY += (e.movementY || 0) * 0.0022 * s * inv;
      } else if (this.dragLook) {
        this.state.lookX += (e.clientX - this.dragX) * 0.004 * s;
        this.state.lookY += (e.clientY - this.dragY) * 0.004 * s * inv;
        this.dragX = e.clientX;
        this.dragY = e.clientY;
      }
    });

    // --- Touch -----------------------------------------------------------
    // Exactly one event model is used, chosen once here. Listening to both is
    // a trap: pointerdown fires *before* touchstart, so the pointer path would
    // claim a finger as the movement stick and the touch path would then
    // register the same finger as the look control. The result is a dead
    // joystick while looking still works.
    //
    // Touch Events are preferred where they exist — every mobile engine
    // implements them consistently, while Pointer Events vary in pointerType
    // reporting and capture behaviour. They are bound to the window so no
    // overlay or stacking context can swallow them.
    const opts = { passive: false, capture: true };
    const useTouchEvents = 'ontouchstart' in window;
    if (useTouchEvents) {
      const forEachTouch = (e, fn) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          fn(t.identifier, t.clientX, t.clientY);
        }
      };
      window.addEventListener('touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        forEachTouch(e, (id, x, y) => this._down(id, x, y));
      }, opts);
      window.addEventListener('touchmove', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        forEachTouch(e, (id, x, y) => this._move(id, x, y));
      }, opts);
      const endTouch = (e) => {
        if (!this.enabled) return;
        forEachTouch(e, (id) => this._up(id));
      };
      window.addEventListener('touchend', endTouch, opts);
      window.addEventListener('touchcancel', endTouch, opts);
    } else {
      // Pen and touch-capable devices without Touch Events.
      c.addEventListener('pointerdown', (e) => {
        if (!this.enabled || e.pointerType === 'mouse') return;
        e.preventDefault();
        this._down(e.pointerId, e.clientX, e.clientY);
      }, { passive: false });
      c.addEventListener('pointermove', (e) => {
        if (!this.enabled || e.pointerType === 'mouse') return;
        e.preventDefault();
        this._move(e.pointerId, e.clientX, e.clientY);
      }, { passive: false });
      const endPointer = (e) => {
        if (!this.enabled || e.pointerType === 'mouse') return;
        this._up(e.pointerId);
      };
      c.addEventListener('pointerup', endPointer, { passive: false });
      c.addEventListener('pointercancel', endPointer, { passive: false });
    }
  }

  /** Request pointer lock, recording a refusal so the fallback can take over. */
  tryPointerLock() {
    const el = this.canvas;
    if (!el.requestPointerLock) { this.pointerLockBlocked = true; return; }
    try {
      const p = el.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.pointerLockBlocked = true; });
    } catch {
      this.pointerLockBlocked = true;
    }
  }

  /** Virtual on-screen buttons register their hit rects each frame. */
  setButtonRects(rects) { this.buttonRects = rects; }

  _hitButton(x, y) {
    if (!this.buttonRects) return null;
    for (const b of this.buttonRects) {
      const dx = x - b.cx, dy = y - b.cy;
      if (dx * dx + dy * dy <= b.r * b.r) return b.name;
    }
    return null;
  }

  /** A finger went down. Coordinates are viewport CSS pixels. */
  _down(id, x, y) {
    const btn = this._hitButton(x, y);
    if (btn) {
      this.touch.buttons.set(id, btn);
      this.heldButtons.add(btn);
      this.buttonHits.add(btn);
      return;
    }
    // Split the screen down the middle: one side steers, the other looks.
    const half = (this.canvas.clientWidth || window.innerWidth) * 0.5;
    const leftZone = this.settings.leftHanded ? x > half : x < half;
    if (leftZone && this.touch.moveId === null) {
      this.touch.moveId = id;
      this.touch.moveOX = x; this.touch.moveOY = y;
      this.touch.moveX = x; this.touch.moveY = y;
    } else if (this.touch.lookId === null) {
      this.touch.lookId = id;
      this.touch.lookX = x; this.touch.lookY = y;
      this.touch.lookMoved = 0;
    }
  }

  _move(id, x, y) {
    if (id === this.touch.moveId) {
      this.touch.moveX = x; this.touch.moveY = y;
    } else if (id === this.touch.lookId) {
      const s = this.settings.touchSensitivity;
      const dx = x - this.touch.lookX;
      const dy = y - this.touch.lookY;
      this.state.lookX += dx * 0.0055 * s;
      this.state.lookY += dy * 0.0055 * s * (this.settings.invertY ? -1 : 1);
      this.touch.lookMoved += Math.hypot(dx, dy);
      this.touch.lookX = x; this.touch.lookY = y;
    }
  }

  _up(id) {
    if (this.touch.buttons.has(id)) {
      const name = this.touch.buttons.get(id);
      this.touch.buttons.delete(id);
      if (![...this.touch.buttons.values()].includes(name)) this.heldButtons.delete(name);
      return;
    }
    if (id === this.touch.moveId) {
      this.touch.moveId = null;
      this.touch.moveX = this.touch.moveOX;
      this.touch.moveY = this.touch.moveOY;
    } else if (id === this.touch.lookId) {
      this.touch.lookId = null;
    }
  }

  /** Joystick position for the HUD to draw, or null when not active. */
  get joystick() {
    if (this.touch.moveId === null) return null;
    return {
      ox: this.touch.moveOX, oy: this.touch.moveOY,
      x: this.touch.moveX, y: this.touch.moveY,
      radius: 62,
    };
  }

  // --- Gamepad ---------------------------------------------------------
  // Standard-mapping layout, which covers Xbox, PlayStation, Switch Pro and
  // the Steam Deck's built-in controls.
  //   left stick  move        right stick  look
  //   A jump      X attack    RT attack
  //   LB/RB/Y/B   skills 1-4  Start        pause

  /** Feed controller state into the same fields the other devices write. */
  pollGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { this.gamepadActive = false; return false; }

    const dead = (v, d = 0.18) =>
      (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

    const lx = dead(gp.axes[0] || 0);
    const ly = dead(gp.axes[1] || 0);
    const rx = dead(gp.axes[2] || 0, 0.14);
    const ry = dead(gp.axes[3] || 0, 0.14);
    const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);

    // Only take over once the player actually touches the controller, so a
    // plugged-in pad does not fight the keyboard.
    const touched = Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.05
      || gp.buttons.some((b) => b && b.pressed);
    if (touched) this.gamepadActive = true;
    if (!this.gamepadActive) return false;

    this.padMove = [lx, -ly];
    // Squaring keeps small stick movements precise while leaving full speed
    // at the edge — flick aiming with a stick is otherwise unusable.
    const sens = 2.6 * this.settings.sensitivity;
    this.state.lookX += rx * Math.abs(rx) * sens * dt;
    this.state.lookY += ry * Math.abs(ry) * sens * dt * (this.settings.invertY ? -1 : 1);

    const prev = this.padPrev || [];
    const pressed = (i) => btn(i) && !prev[i];
    const SKILL_BUTTONS = [4, 5, 3, 1];          // LB, RB, Y, B
    for (let i = 0; i < 4; i++) {
      if (pressed(SKILL_BUTTONS[i])) this.state.skills[i] = true;
    }
    if (pressed(9)) this.state.pause = true;      // Start

    this.padJump = btn(0);                        // A
    this.padAttack = btn(2) || btn(7);            // X or right trigger
    this.padSprint = btn(10) || btn(6);           // L3 or left trigger
    this.padPrev = gp.buttons.map((b) => !!(b && b.pressed));
    return true;
  }

  /** Collapse raw input into the state the player reads. Call once per frame. */
  poll(dt = 1 / 60) {
    const s = this.state;
    this.padMove = null;
    this.padJump = this.padAttack = this.padSprint = false;
    if (this.enabled) this.pollGamepad(dt);
    // Keyboard movement
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;

    // Touch joystick overrides when active
    const j = this.joystick;
    if (j) {
      const dx = j.x - j.ox, dy = j.y - j.oy;
      const d = Math.hypot(dx, dy);
      const k = d > 0 ? Math.min(1, d / j.radius) / d : 0;
      mx = dx * k;
      my = -dy * k;
    }
    // A live controller stick wins over the keyboard's digital directions.
    if (this.padMove && (this.padMove[0] || this.padMove[1])) {
      mx = this.padMove[0];
      my = this.padMove[1];
    }
    s.moveX = clamp(mx, -1, 1);
    s.moveY = clamp(my, -1, 1);

    s.jump = this.keys.has('Space') || this.heldButtons.has('jump')
      || this.buttonHits.has('jump') || this.padJump;
    s.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || s.sprint
      || this.heldButtons.has('sprint') || this.padSprint;
    s.attack = this.mouseDown || this.heldButtons.has('attack')
      || this.buttonHits.has('attack') || this.padAttack;

    for (let i = 0; i < 4; i++) {
      if (this.buttonHits.has('skill' + i)) s.skills[i] = true;
    }
    this.buttonHits.clear();
    return s;
  }

  /** Consume accumulated look delta. */
  takeLook() {
    const dx = this.state.lookX, dy = this.state.lookY;
    this.state.lookX = 0; this.state.lookY = 0;
    return [dx, dy];
  }

  takePause() {
    const p = this.state.pause;
    this.state.pause = false;
    return p;
  }
}
