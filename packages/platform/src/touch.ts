/**
 * @soryos/platform
 * Touch and gesture utilities for mobile and tablet support.
 */

import type { TouchEventData, GestureEvent, GestureType } from "./types";
import { detectPlatformType, isTouchDevice, hasCoarsePointer } from "./detect";

// Touch event state
type TouchState = {
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  touches: Map<number, { x: number; y: number; time: number }>;
  isTapping: boolean;
  tapCount: number;
  lastTapTime: number;
};

// Create touch state
function createTouchState(): TouchState {
  return {
    startX: 0,
    startY: 0,
    startTime: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    touches: new Map(),
    isTapping: false,
    tapCount: 0,
    lastTapTime: 0,
  };
}

// Touch event handlers type
export type TouchEventHandlers = {
  onTap?: (event: TouchEventData) => void;
  onDoubleTap?: (event: TouchEventData) => void;
  onLongPress?: (event: TouchEventData) => void;
  onSwipe?: (event: GestureEvent) => void;
  onPan?: (event: GestureEvent) => void;
  onPinch?: (event: GestureEvent) => void;
  onGesture?: (event: GestureEvent) => void;
};

/**
 * Create a touch gesture recognizer
 */
export class TouchGestureRecognizer {
  private element: HTMLElement | Window;
  private state: TouchState;
  private handlers: TouchEventHandlers;
  private longPressTimeout: number | null = null;
  private tapTimeout: number | null = null;

  // Configuration
  private readonly config = {
    tapMaxDuration: 300, // ms
    tapMaxDistance: 10, // pixels
    doubleTapMaxDuration: 500, // ms
    longPressDuration: 500, // ms
    swipeMinDistance: 50, // pixels
    swipeMinVelocity: 0.5, // pixels/ms
    pinchMinDistance: 20, // pixels
  };

  constructor(
    element: HTMLElement | Window,
    handlers: TouchEventHandlers = {}
  ) {
    this.element = element;
    this.handlers = handlers;
    this.state = createTouchState();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (typeof window === "undefined") return;

    const element = this.element === window ? window : this.element;
    
    // Touch event listeners
    element.addEventListener("touchstart", this.handleTouchStart.bind(this), { passive: false });
    element.addEventListener("touchmove", this.handleTouchMove.bind(this), { passive: false });
    element.addEventListener("touchend", this.handleTouchEnd.bind(this), { passive: false });
    element.addEventListener("touchcancel", this.handleTouchCancel.bind(this), { passive: false });

    // Mouse event listeners for touch emulation
    element.addEventListener("mousedown", this.handleMouseDown.bind(this));
    element.addEventListener("mousemove", this.handleMouseMove.bind(this));
    element.addEventListener("mouseup", this.handleMouseUp.bind(this));
    element.addEventListener("mouseleave", this.handleMouseLeave.bind(this));
  }

  private handleTouchStart(event: TouchEvent): void {
    if (!this.isPrimaryTouch(event)) return;

    event.preventDefault();
    
    const touch = event.touches[0];
    const now = Date.now();

    this.state.startX = touch.clientX;
    this.state.startY = touch.clientY;
    this.state.startTime = now;
    this.state.lastX = touch.clientX;
    this.state.lastY = touch.clientY;
    this.state.lastTime = now;
    this.state.isTapping = true;
    this.state.touches.clear();

    // Store all touches
    for (let i = 0; i < event.touches.length; i++) {
      const t = event.touches[i];
      this.state.touches.set(t.identifier, { x: t.clientX, y: t.clientY, time: now });
    }

    // Start long press timeout
    this.longPressTimeout = window.setTimeout(() => {
      this.triggerLongPress(event);
    }, this.config.longPressDuration);

    // Start tap timeout
    this.tapTimeout = window.setTimeout(() => {
      this.state.isTapping = false;
    }, this.config.tapMaxDuration);
  }

  private handleTouchMove(event: TouchEvent): void {
    if (!this.isPrimaryTouch(event)) return;

    const touch = event.touches[0];
    const now = Date.now();
    const deltaX = touch.clientX - this.state.lastX;
    const deltaY = touch.clientY - this.state.lastY;
    const deltaTime = now - this.state.lastTime;

    // Update touch positions
    this.state.lastX = touch.clientX;
    this.state.lastY = touch.clientY;
    this.state.lastTime = now;

    // Update all touches
    for (let i = 0; i < event.touches.length; i++) {
      const t = event.touches[i];
      this.state.touches.set(t.identifier, { x: t.clientX, y: t.clientY, time: now });
    }

    // Check if this is still a tap
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > this.config.tapMaxDistance) {
      this.state.isTapping = false;
      if (this.tapTimeout) {
        clearTimeout(this.tapTimeout);
        this.tapTimeout = null;
      }
    }

    // Check for swipe
    if (deltaTime > 0) {
      const velocityX = deltaX / deltaTime;
      const velocityY = deltaY / deltaTime;
      
      this.triggerSwipe(event, {
        x: touch.clientX,
        y: touch.clientY,
        deltaX,
        deltaY,
        velocityX,
        velocityY,
      });
    }

    // Check for pan (multi-touch)
    if (event.touches.length > 1) {
      this.checkPinch(event);
    }
  }

  private handleTouchEnd(event: TouchEvent): void {
    if (!this.isPrimaryTouch(event)) return;

    const touch = event.changedTouches[0];
    const now = Date.now();
    const duration = now - this.state.startTime;
    const distanceX = touch.clientX - this.state.startX;
    const distanceY = touch.clientY - this.state.startY;
    const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

    // Clear timeouts
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }

    // Check for tap
    if (this.state.isTapping && duration <= this.config.tapMaxDuration && distance <= this.config.tapMaxDistance) {
      this.state.tapCount++;
      
      // Check for double tap
      if (now - this.state.lastTapTime <= this.config.doubleTapMaxDuration && this.state.tapCount >= 2) {
        this.triggerDoubleTap(event);
        this.state.tapCount = 0;
      } else {
        this.triggerTap(event);
      }
      
      this.state.lastTapTime = now;
    }

    // Reset state
    this.state.isTapping = false;
    this.state.touches.clear();
  }

  private handleTouchCancel(event: TouchEvent): void {
    // Clear timeouts
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }
    if (this.tapTimeout) {
      clearTimeout(this.tapTimeout);
      this.tapTimeout = null;
    }

    // Reset state
    this.state.isTapping = false;
    this.state.touches.clear();
  }

  private handleMouseDown(event: MouseEvent): void {
    // Only handle if this is a touch device or if we're emulating touch
    if (!isTouchDevice() && !hasCoarsePointer()) return;

    event.preventDefault();

    const now = Date.now();

    this.state.startX = event.clientX;
    this.state.startY = event.clientY;
    this.state.startTime = now;
    this.state.lastX = event.clientX;
    this.state.lastY = event.clientY;
    this.state.lastTime = now;
    this.state.isTapping = true;

    // Start long press timeout
    this.longPressTimeout = window.setTimeout(() => {
      this.triggerLongPressFromMouse(event);
    }, this.config.longPressDuration);

    // Start tap timeout
    this.tapTimeout = window.setTimeout(() => {
      this.state.isTapping = false;
    }, this.config.tapMaxDuration);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!isTouchDevice() && !hasCoarsePointer()) return;

    const now = Date.now();
    const deltaX = event.clientX - this.state.lastX;
    const deltaY = event.clientY - this.state.lastY;

    // Update positions
    this.state.lastX = event.clientX;
    this.state.lastY = event.clientY;
    this.state.lastTime = now;

    // Check if this is still a tap
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > this.config.tapMaxDistance) {
      this.state.isTapping = false;
      if (this.tapTimeout) {
        clearTimeout(this.tapTimeout);
        this.tapTimeout = null;
      }
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (!isTouchDevice() && !hasCoarsePointer()) return;

    const now = Date.now();
    const duration = now - this.state.startTime;
    const distanceX = event.clientX - this.state.startX;
    const distanceY = event.clientY - this.state.startY;
    const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

    // Clear timeouts
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }

    // Check for tap
    if (this.state.isTapping && duration <= this.config.tapMaxDuration && distance <= this.config.tapMaxDistance) {
      this.state.tapCount++;
      
      if (now - this.state.lastTapTime <= this.config.doubleTapMaxDuration && this.state.tapCount >= 2) {
        this.triggerDoubleTapFromMouse(event);
        this.state.tapCount = 0;
      } else {
        this.triggerTapFromMouse(event);
      }
      
      this.state.lastTapTime = now;
    }

    // Reset state
    this.state.isTapping = false;
  }

  private handleMouseLeave(event: MouseEvent): void {
    // Clear timeouts
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }
    if (this.tapTimeout) {
      clearTimeout(this.tapTimeout);
      this.tapTimeout = null;
    }

    // Reset state
    this.state.isTapping = false;
  }

  private isPrimaryTouch(event: TouchEvent): boolean {
    return event.touches.length > 0 && event.touches[0].identifier === 0;
  }

  private triggerTap(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    const now = Date.now();

    const touchData: TouchEventData = {
      type: "touchend",
      touches: Array.from(event.touches),
      changedTouches: Array.from(event.changedTouches),
      targetTouches: Array.from(event.targetTouches),
      timestamp: now,
      x: touch.clientX,
      y: touch.clientY,
      deltaX: touch.clientX - this.state.startX,
      deltaY: touch.clientY - this.state.startY,
      velocityX: 0,
      velocityY: 0,
    };

    this.handlers.onTap?.(touchData);
    this.triggerGesture("tap", touchData);
  }

  private triggerDoubleTap(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    const now = Date.now();

    const touchData: TouchEventData = {
      type: "touchend",
      touches: Array.from(event.touches),
      changedTouches: Array.from(event.changedTouches),
      targetTouches: Array.from(event.targetTouches),
      timestamp: now,
      x: touch.clientX,
      y: touch.clientY,
      deltaX: touch.clientX - this.state.startX,
      deltaY: touch.clientY - this.state.startY,
      velocityX: 0,
      velocityY: 0,
    };

    this.handlers.onDoubleTap?.(touchData);
    this.triggerGesture("doubleTap", touchData);
  }

  private triggerLongPress(event: TouchEvent): void {
    const touch = event.touches[0];
    const now = Date.now();

    const touchData: TouchEventData = {
      type: "touchstart",
      touches: Array.from(event.touches),
      changedTouches: Array.from(event.changedTouches),
      targetTouches: Array.from(event.targetTouches),
      timestamp: now,
      x: touch.clientX,
      y: touch.clientY,
      deltaX: 0,
      deltaY: 0,
      velocityX: 0,
      velocityY: 0,
    };

    this.handlers.onLongPress?.(touchData);
    this.triggerGesture("longPress", touchData);
  }

  private triggerSwipe(
    event: TouchEvent,
    data: { x: number; y: number; deltaX: number; deltaY: number; velocityX: number; velocityY: number }
  ): void {
    const now = Date.now();
    const absDeltaX = Math.abs(data.deltaX);
    const absDeltaY = Math.abs(data.deltaY);

    // Determine swipe direction
    let direction: "left" | "right" | "up" | "down" | null = null;

    if (absDeltaX > this.config.swipeMinDistance || absDeltaY > this.config.swipeMinDistance) {
      if (absDeltaX > absDeltaY) {
        direction = data.deltaX > 0 ? "right" : "left";
      } else {
        direction = data.deltaY > 0 ? "down" : "up";
      }
    }

    if (!direction) return;

    const gesture: GestureEvent = {
      type: "swipe",
      timestamp: now,
      x: data.x,
      y: data.y,
      deltaX: data.deltaX,
      deltaY: data.deltaY,
      velocityX: data.velocityX,
      velocityY: data.velocityY,
    };

    this.handlers.onSwipe?.(gesture);
    this.triggerGesture("swipe", { ...gesture, direction });
  }

  private checkPinch(event: TouchEvent): void {
    if (event.touches.length < 2) return;

    const touch1 = event.touches[0];
    const touch2 = event.touches[1];
    const now = Date.now();

    // Get previous positions
    const prev1 = this.state.touches.get(touch1.identifier);
    const prev2 = this.state.touches.get(touch2.identifier);

    if (!prev1 || !prev2) return;

    // Calculate current distance
    const currDistance = Math.sqrt(
      Math.pow(touch1.clientX - touch2.clientX, 2) +
      Math.pow(touch1.clientY - touch2.clientY, 2)
    );

    // Calculate previous distance
    const prevDistance = Math.sqrt(
      Math.pow(prev1.x - prev2.x, 2) +
      Math.pow(prev1.y - prev2.y, 2)
    );

    // Calculate scale
    const scale = prevDistance > 0 ? currDistance / prevDistance : 1;

    const gesture: GestureEvent = {
      type: "pinch",
      timestamp: now,
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
      scale,
    };

    this.handlers.onPinch?.(gesture);
    this.triggerGesture("pinch", gesture);
  }

  private triggerTapFromMouse(event: MouseEvent): void {
    const now = Date.now();

    const touchData: TouchEventData = {
      type: "touchend",
      touches: [],
      changedTouches: [],
      targetTouches: [],
      timestamp: now,
      x: event.clientX,
      y: event.clientY,
      deltaX: event.clientX - this.state.startX,
      deltaY: event.clientY - this.state.startY,
      velocityX: 0,
      velocityY: 0,
    };

    this.handlers.onTap?.(touchData);
    this.triggerGesture("tap", touchData);
  }

  private triggerDoubleTapFromMouse(event: MouseEvent): void {
    const now = Date.now();

    const touchData: TouchEventData = {
      type: "touchend",
      touches: [],
      changedTouches: [],
      targetTouches: [],
      timestamp: now,
      x: event.clientX,
      y: event.clientY,
      deltaX: event.clientX - this.state.startX,
      deltaY: event.clientY - this.state.startY,
      velocityX: 0,
      velocityY: 0,
    };

    this.handlers.onDoubleTap?.(touchData);
    this.triggerGesture("doubleTap", touchData);
  }

  private triggerLongPressFromMouse(event: MouseEvent): void {
    const now = Date.now();

    const touchData: TouchEventData = {
      type: "touchstart",
      touches: [],
      changedTouches: [],
      targetTouches: [],
      timestamp: now,
      x: event.clientX,
      y: event.clientY,
      deltaX: 0,
      deltaY: 0,
      velocityX: 0,
      velocityY: 0,
    };

    this.handlers.onLongPress?.(touchData);
    this.triggerGesture("longPress", touchData);
  }

  private triggerGesture(type: GestureType, data: TouchEventData | GestureEvent): void {
    const now = Date.now();

    const gesture: GestureEvent = {
      type,
      timestamp: now,
      x: "x" in data ? data.x : 0,
      y: "y" in data ? data.y : 0,
      deltaX: "deltaX" in data ? data.deltaX : 0,
      deltaY: "deltaY" in data ? data.deltaY : 0,
      velocityX: "velocityX" in data ? data.velocityX : 0,
      velocityY: "velocityY" in data ? data.velocityY : 0,
      scale: "scale" in data ? data.scale : undefined,
      rotation: "rotation" in data ? data.rotation : undefined,
      distance: "distance" in data ? data.distance : undefined,
    };

    this.handlers.onGesture?.(gesture);
  }

  /**
   * Update handlers
   */
  updateHandlers(handlers: TouchEventHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Destroy the recognizer
   */
  destroy(): void {
    if (typeof window === "undefined") return;

    const element = this.element === window ? window : this.element;

    // Remove event listeners
    element.removeEventListener("touchstart", this.handleTouchStart.bind(this));
    element.removeEventListener("touchmove", this.handleTouchMove.bind(this));
    element.removeEventListener("touchend", this.handleTouchEnd.bind(this));
    element.removeEventListener("touchcancel", this.handleTouchCancel.bind(this));

    element.removeEventListener("mousedown", this.handleMouseDown.bind(this));
    element.removeEventListener("mousemove", this.handleMouseMove.bind(this));
    element.removeEventListener("mouseup", this.handleMouseUp.bind(this));
    element.removeEventListener("mouseleave", this.handleMouseLeave.bind(this));

    // Clear timeouts
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }
    if (this.tapTimeout) {
      clearTimeout(this.tapTimeout);
      this.tapTimeout = null;
    }
  }
}

/**
 * Create a simple touch gesture recognizer for a specific element
 */
export function createTouchRecognizer(
  element: HTMLElement,
  handlers: TouchEventHandlers = {}
): TouchGestureRecognizer {
  return new TouchGestureRecognizer(element, handlers);
}

/**
 * Check if touch events should be used instead of mouse events
 */
export function shouldUseTouchEvents(): boolean {
  return isTouchDevice() || hasCoarsePointer();
}

/**
 * Get touch event properties from a mouse event (for touch emulation)
 */
export function getTouchFromMouseEvent(event: MouseEvent): Touch {
  return {
    identifier: 0,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    pageX: event.pageX,
    pageY: event.pageY,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
    target: event.target,
    currentTarget: event.currentTarget,
    relatedTarget: null,
    eventPhase: event.eventPhase,
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    defaultPrevented: event.defaultPrevented,
    composed: event.composed,
    timeStamp: event.timeStamp,
    view: window,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    getModifierState: event.getModifierState.bind(event),
    touchType: "direct",
  };
}

/**
 * Create a touch event from a mouse event
 */
export function createTouchEventFromMouse(
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  mouseEvent: MouseEvent
): TouchEvent {
  const touch = getTouchFromMouseEvent(mouseEvent);
  
  return {
    touches: type === "touchend" || type === "touchcancel" ? [] : [touch],
    changedTouches: type === "touchstart" ? [] : [touch],
    targetTouches: type === "touchend" || type === "touchcancel" ? [] : [touch],
    altKey: mouseEvent.altKey,
    shiftKey: mouseEvent.shiftKey,
    ctrlKey: mouseEvent.ctrlKey,
    metaKey: mouseEvent.metaKey,
    getModifierState: mouseEvent.getModifierState.bind(mouseEvent),
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    composed: true,
    timeStamp: Date.now(),
    view: window,
    target: mouseEvent.target,
    currentTarget: mouseEvent.currentTarget,
    eventPhase: mouseEvent.eventPhase,
    type,
  } as TouchEvent;
}
