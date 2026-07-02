function memoize(fn, keyFn) {
  const cache = new Map();
  return function memoized(...args) {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

function once(fn) {
  let called = false;
  let result;
  return function onceWrapped(...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}

function retry(fn, attempts) {
  return async function retried(...args) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
}

module.exports = { memoize, once, retry };
