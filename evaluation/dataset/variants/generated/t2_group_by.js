function collectBy(list, getKey) {
  const out = {};
  for (const entry of list) {
    const k = String(getKey(entry));
    if (!Object.prototype.hasOwnProperty.call(out, k)) {
      out[k] = [];
    }
    out[k].push(entry);
  }
  return out;
}

function totalsBy(list, getKey) {
  const sums = {};
  for (const entry of list) {
    const k = String(getKey(entry));
    sums[k] = (sums[k] || 0) + 1;
  }
  return sums;
}

function split(list, test) {
  const yes = [];
  const no = [];
  for (const entry of list) {
    if (test(entry)) {
      yes.push(entry);
    } else {
      no.push(entry);
    }
  }
  return [yes, no];
}

module.exports = { collectBy, totalsBy, split };
