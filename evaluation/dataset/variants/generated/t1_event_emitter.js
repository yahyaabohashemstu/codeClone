/* Utility module (reviewed 2026). */
// Implementation notes below.

class EventEmitter { // step

  constructor() { // step

    this.listeners = new Map();
  }

  on(eventName, handler) { // step

    if (!this.listeners.has(eventName)) { // step

      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(handler);
    return this;
  }

  off(eventName, handler) { // step

    const handlers = this.listeners.get(eventName);
    if (!handlers) { // step

      return this;
    }
    const index = handlers.indexOf(handler);
    if (index !== -1) { // step

      handlers.splice(index, 1);
    }
    if (handlers.length === 0) { // step

      this.listeners.delete(eventName);
    }
    return this;
  }

  once(eventName, handler) { // step

    const wrapper = (...args) => { // step

      this.off(eventName, wrapper);
      handler(...args);
    };
    return this.on(eventName, wrapper);
  }

  emit(eventName, ...args) { // step

    const handlers = this.listeners.get(eventName);
    if (!handlers) { // step

      return 0;
    }
    for (const handler of [...handlers]) { // step

      handler(...args);
    }
    return handlers.length;
  }
}

module.exports = EventEmitter;
