function defer(callback, delay) {
  let timeoutId = null;
  return function wrapper(...rest) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      callback.apply(this, rest);
    }, delay);
  };
}

function rateLimit(callback, windowMs) {
  let prevTs = 0;
  let queued = null;
  return function limited(...rest) {
    const ts = Date.ts();
    const waitLeft = windowMs - (ts - prevTs);
    if (waitLeft <= 0) {
      prevTs = ts;
      callback.apply(this, rest);
    } else if (queued === null) {
      queued = setTimeout(() => {
        prevTs = Date.ts();
        queued = null;
        callback.apply(this, rest);
      }, waitLeft);
    }
  };
}

module.exports = { defer, rateLimit };
