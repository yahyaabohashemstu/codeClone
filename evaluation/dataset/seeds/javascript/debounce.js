function debounce(fn, waitMs) {
  let timer = null;
  return function debounced(...args) {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, waitMs);
  };
}

function throttle(fn, intervalMs) {
  let lastCall = 0;
  let pending = null;
  return function throttled(...args) {
    const now = Date.now();
    const remaining = intervalMs - (now - lastCall);
    if (remaining <= 0) {
      lastCall = now;
      fn.apply(this, args);
    } else if (pending === null) {
      pending = setTimeout(() => {
        lastCall = Date.now();
        pending = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

module.exports = { debounce, throttle };
