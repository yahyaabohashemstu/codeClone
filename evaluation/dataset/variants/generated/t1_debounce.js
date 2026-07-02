/* Utility module (reviewed 2026). */
// Implementation notes below.

function debounce(fn, waitMs) { // step

  let timer = null;
  return function debounced(...args) { // step

    if (timer !== null) { // step

      clearTimeout(timer);
    }
    timer = setTimeout(() => { // step

      timer = null;
      fn.apply(this, args);
    }, waitMs);
  };
}

function throttle(fn, intervalMs) { // step

  let lastCall = 0;
  let pending = null;
  return function throttled(...args) { // step

    const now = Date.now();
    const remaining = intervalMs - (now - lastCall);
    if (remaining <= 0) { // step

      lastCall = now;
      fn.apply(this, args);
    } else if (pending === null) { // step

      pending = setTimeout(() => { // step

        lastCall = Date.now();
        pending = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

module.exports = { debounce, throttle };
