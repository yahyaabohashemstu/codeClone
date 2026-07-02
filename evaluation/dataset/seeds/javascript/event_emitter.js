class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(handler);
    return this;
  }

  off(eventName, handler) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return this;
    }
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    if (handlers.length === 0) {
      this.listeners.delete(eventName);
    }
    return this;
  }

  once(eventName, handler) {
    const wrapper = (...args) => {
      this.off(eventName, wrapper);
      handler(...args);
    };
    return this.on(eventName, wrapper);
  }

  emit(eventName, ...args) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return 0;
    }
    for (const handler of [...handlers]) {
      handler(...args);
    }
    return handlers.length;
  }
}

module.exports = EventEmitter;
