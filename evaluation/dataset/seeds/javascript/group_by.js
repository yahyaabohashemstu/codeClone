function groupBy(items, keyFn) {
  const groups = {};
  for (const item of items) {
    const key = String(keyFn(item));
    if (!Object.prototype.hasOwnProperty.call(groups, key)) {
      groups[key] = [];
    }
    groups[key].push(item);
  }
  return groups;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = String(keyFn(item));
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function partition(items, predicate) {
  const matched = [];
  const rest = [];
  for (const item of items) {
    if (predicate(item)) {
      matched.push(item);
    } else {
      rest.push(item);
    }
  }
  return [matched, rest];
}

module.exports = { groupBy, countBy, partition };
