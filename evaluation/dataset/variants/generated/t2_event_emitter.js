class PubSub {
  constructor() {
    this.channels = new Map();
  }

  on(topic, fn) {
    if (!this.channels.has(topic)) {
      this.channels.set(topic, []);
    }
    this.channels.get(topic).push(fn);
    return this;
  }

  off(topic, fn) {
    const fns = this.channels.get(topic);
    if (!fns) {
      return this;
    }
    const pos = fns.indexOf(fn);
    if (pos !== -1) {
      fns.splice(pos, 1);
    }
    if (fns.length === 0) {
      this.channels.delete(topic);
    }
    return this;
  }

  onceOnly(topic, fn) {
    const proxy = (...payload) => {
      this.off(topic, proxy);
      fn(...payload);
    };
    return this.on(topic, proxy);
  }

  publish(topic, ...payload) {
    const fns = this.channels.get(topic);
    if (!fns) {
      return 0;
    }
    for (const fn of [...fns]) {
      fn(...payload);
    }
    return fns.length;
  }
}

module.exports = PubSub;
