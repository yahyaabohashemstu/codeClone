function delayCalls(callback, delayMs, options = {}) {
  let handle = null;
  const leading = Boolean(options.leading);
  return function wrapped(...params) {
    const shouldCallNow = leading && handle === null;
    if (handle !== null) {
      clearTimeout(handle);
    }
    handle = setTimeout(() => {
      handle = null;
      if (!leading) {
        callback.apply(this, params);
      }
    }, delayMs);
    if (shouldCallNow) {
      callback.apply(this, params);
    }
  };
}

function limitRate(callback, gapMs) {
  let previousTime = 0;
  return function limited(...params) {
    const currentTime = Date.now();
    if (currentTime - previousTime >= gapMs) {
      previousTime = currentTime;
      callback.apply(this, params);
    }
  };
}

module.exports = { delayCalls, limitRate };
