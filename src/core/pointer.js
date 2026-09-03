// src/core/pointer.js
//
// Synthetic pointer.
//
// This is the layer that decides how much of "a mouse" the library actually is.
// The previous implementation looked up an element by tag name whitelist and
// dispatched a single bare `click`, which meant `<div onClick>` was unreachable,
// anything listening on `pointerdown` (Radix, MUI menus, most drag libraries)
// never fired, and handlers reading `event.clientX` saw 0.
//
// Here we emit the same event stream a real pointing device produces:
//
//   hover      pointerout/leave -> pointerover/enter (+ mouse* compatibility)
//   move       pointermove, mousemove
//   click      pointerdown, mousedown, pointerup, mouseup, click
//   dblclick   two click sequences within the double-click window
//   right      pointerdown(button 2), pointerup, contextmenu
//   drag       pointerdown, pointermove..., pointerup
//
// Known limits, which are properties of the platform rather than of this code:
//
//   * Synthetic events carry `isTrusted: false`. They do not grant transient
//     user activation, so APIs gated behind it (clipboard read, fullscreen,
//     popup windows) cannot be driven from here.
//   * CSS `:hover` is driven by the browser's own hit testing, not by
//     dispatched events. JavaScript hover handlers fire; `:hover` styling does
//     not. Use `.aircursor-hover`, which this class adds to the hovered
//     element, if you want a visual hover state.
//   * Native HTML5 drag-and-drop (`draggable="true"`) only starts from trusted
//     input. Pointer-event based drag libraries work; native DnD does not.

const POINTER_ID = 1;
export const HOVER_CLASS = 'aircursor-hover';

function supportsPointerEvent() {
  return typeof window !== 'undefined' && typeof window.PointerEvent === 'function';
}

/** Walk up through parents, crossing shadow boundaries via the host element. */
function ancestorChain(element) {
  const chain = [];
  let node = element;
  while (node) {
    chain.push(node);
    if (node.parentElement) {
      node = node.parentElement;
    } else {
      const root = node.parentNode;
      node = root && root.host ? root.host : null;
    }
  }
  return chain;
}

function firstCommonAncestor(chainA, chainB) {
  const set = new Set(chainA);
  for (const node of chainB) {
    if (set.has(node)) return node;
  }
  return null;
}

/**
 * Topmost element at a viewport point, descending into open shadow roots so
 * that web components are addressable.
 */
export function hitTest(x, y) {
  if (typeof document === 'undefined') return null;
  let element = document.elementFromPoint(x, y);
  let guard = 0;
  while (element && element.shadowRoot && guard++ < 16) {
    const inner = element.shadowRoot.elementFromPoint
      ? element.shadowRoot.elementFromPoint(x, y)
      : null;
    if (!inner || inner === element) break;
    element = inner;
  }
  return element;
}

export class VirtualPointer {
  /**
   * @param {object} [options]
   * @param {'mouse'|'pen'|'touch'} [options.pointerType='mouse']
   * @param {number} [options.doubleClickMs=400] max gap between the two clicks of a double click
   * @param {number} [options.doubleClickSlop=16] max px between them
   * @param {boolean} [options.hoverClass=true] toggle HOVER_CLASS on the hovered element
   */
  constructor({
    pointerType = 'mouse',
    doubleClickMs = 400,
    doubleClickSlop = 16,
    hoverClass = true,
  } = {}) {
    this.pointerType = pointerType;
    this.doubleClickMs = doubleClickMs;
    this.doubleClickSlop = doubleClickSlop;
    this.useHoverClass = hoverClass;

    this.x = 0;
    this.y = 0;
    this.currentTarget = null;
    this.pressed = false;
    this.pressButton = 0;
    this.pressTarget = null;

    this.lastClickTime = 0;
    this.lastClickX = 0;
    this.lastClickY = 0;
    this.clickCount = 0;
  }

  // ---------------------------------------------------------------- dispatch

  _init(extra = {}) {
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: typeof window !== 'undefined' ? window : null,
      detail: 0,
      clientX: this.x,
      clientY: this.y,
      screenX: (typeof window !== 'undefined' ? window.screenX || 0 : 0) + this.x,
      screenY: (typeof window !== 'undefined' ? window.screenY || 0 : 0) + this.y,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      button: 0,
      buttons: this.pressed ? (this.pressButton === 2 ? 2 : 1) : 0,
      relatedTarget: null,
    };
    return { ...base, ...extra };
  }

  _dispatchPointer(target, type, extra = {}) {
    if (!target) return;
    const init = this._init({
      pointerId: POINTER_ID,
      pointerType: this.pointerType,
      isPrimary: true,
      width: 1,
      height: 1,
      pressure: this.pressed ? 0.5 : 0,
      tangentialPressure: 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      ...extra,
    });
    const Ctor = supportsPointerEvent() ? window.PointerEvent : window.MouseEvent;
    target.dispatchEvent(new Ctor(type, init));
  }

  _dispatchMouse(target, type, extra = {}) {
    if (!target || typeof window === 'undefined') return;
    target.dispatchEvent(new window.MouseEvent(type, this._init(extra)));
  }

  /** Pointer event followed by its mouse compatibility event. */
  _dispatchPair(target, pointerType, mouseType, extra = {}) {
    this._dispatchPointer(target, pointerType, extra);
    this._dispatchMouse(target, mouseType, extra);
  }

  // ------------------------------------------------------------------- hover

  _setHover(nextTarget) {
    if (nextTarget === this.currentTarget) return;

    const previous = this.currentTarget;
    const previousChain = previous ? ancestorChain(previous) : [];
    const nextChain = nextTarget ? ancestorChain(nextTarget) : [];
    const common = firstCommonAncestor(previousChain, nextChain);

    if (previous) {
      if (this.useHoverClass && previous.classList) {
        previous.classList.remove(HOVER_CLASS);
      }
      this._dispatchPair(previous, 'pointerout', 'mouseout', { relatedTarget: nextTarget });
      for (const node of previousChain) {
        if (node === common) break;
        this._dispatchPointer(node, 'pointerleave', { relatedTarget: nextTarget, bubbles: false, cancelable: false });
        this._dispatchMouse(node, 'mouseleave', { relatedTarget: nextTarget, bubbles: false, cancelable: false });
      }
    }

    this.currentTarget = nextTarget;

    if (nextTarget) {
      this._dispatchPair(nextTarget, 'pointerover', 'mouseover', { relatedTarget: previous });
      const entering = [];
      for (const node of nextChain) {
        if (node === common) break;
        entering.push(node);
      }
      entering.reverse();
      for (const node of entering) {
        this._dispatchPointer(node, 'pointerenter', { relatedTarget: previous, bubbles: false, cancelable: false });
        this._dispatchMouse(node, 'mouseenter', { relatedTarget: previous, bubbles: false, cancelable: false });
      }
      if (this.useHoverClass && nextTarget.classList) {
        nextTarget.classList.add(HOVER_CLASS);
      }
    }
  }

  // -------------------------------------------------------------- public API

  /**
   * Move the pointer to a viewport coordinate. Updates hover and emits
   * pointermove/mousemove. While pressed the hover target is kept (pointer
   * capture semantics), which is what drag interactions expect.
   */
  move(x, y) {
    this.x = x;
    this.y = y;

    if (!this.pressed) {
      this._setHover(hitTest(x, y));
      this._dispatchPair(this.currentTarget, 'pointermove', 'mousemove');
    } else {
      // Captured: the press target keeps receiving moves even if the cursor
      // has travelled off it.
      this._dispatchPair(this.pressTarget || this.currentTarget, 'pointermove', 'mousemove');
    }
  }

  /**
   * Press a button at the current position.
   * @param {number} [button=0] 0 = primary, 2 = secondary
   */
  press(button = 0) {
    if (this.pressed) return;
    const target = hitTest(this.x, this.y);
    this._setHover(target);
    this.pressed = true;
    this.pressButton = button;
    this.pressTarget = target;
    if (!target) return;

    this._dispatchPointer(target, 'pointerdown', { button, buttons: button === 2 ? 2 : 1 });
    this._dispatchMouse(target, 'mousedown', { button, buttons: button === 2 ? 2 : 1 });
  }

  /**
   * Release the pressed button, emitting pointerup/mouseup and, when the
   * release lands on the same subtree as the press, click (and dblclick, and
   * contextmenu for the secondary button).
   */
  release() {
    if (!this.pressed) return;
    const button = this.pressButton;
    const upTarget = hitTest(this.x, this.y);
    const downTarget = this.pressTarget;

    this.pressed = false;
    this.pressButton = 0;
    this.pressTarget = null;

    this._dispatchPointer(upTarget || downTarget, 'pointerup', { button, buttons: 0 });
    this._dispatchMouse(upTarget || downTarget, 'mouseup', { button, buttons: 0 });

    if (!downTarget || !upTarget) return;

    // Per the UI Events spec, click fires on the nearest common inclusive
    // ancestor of the press and release targets.
    const target =
      downTarget === upTarget
        ? downTarget
        : firstCommonAncestor(ancestorChain(downTarget), ancestorChain(upTarget));
    if (!target) return;

    if (button === 2) {
      this._dispatchMouse(target, 'contextmenu', { button: 2, buttons: 0 });
      return;
    }

    const now = Date.now();
    const near =
      Math.hypot(this.x - this.lastClickX, this.y - this.lastClickY) <= this.doubleClickSlop;
    this.clickCount = near && now - this.lastClickTime <= this.doubleClickMs ? this.clickCount + 1 : 1;
    this.lastClickTime = now;
    this.lastClickX = this.x;
    this.lastClickY = this.y;

    this._dispatchMouse(target, 'click', { button, buttons: 0, detail: this.clickCount });
    if (this.clickCount === 2) {
      this._dispatchMouse(target, 'dblclick', { button, buttons: 0, detail: 2 });
    }
  }

  /** Full secondary-button sequence at the current position. */
  contextMenu() {
    this.press(2);
    this.release();
  }

  /** Abort a press without producing a click (hand lost, gesture cancelled). */
  cancel() {
    if (!this.pressed) return;
    const target = this.pressTarget;
    this.pressed = false;
    this.pressButton = 0;
    this.pressTarget = null;
    this._dispatchPointer(target, 'pointercancel', { button: 0, buttons: 0, cancelable: false });
  }

  /** Drop hover state and any in-flight press. Call when tracking is lost. */
  clear() {
    this.cancel();
    this._setHover(null);
  }
}
