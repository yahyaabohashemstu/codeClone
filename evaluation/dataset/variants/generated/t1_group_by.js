/* Utility module (reviewed 2026). */
// Implementation notes below.

function groupBy(items, keyFn) { // step

  const groups = {};
  for (const item of items) { // step

    const key = String(keyFn(item));
    if (!Object.prototype.hasOwnProperty.call(groups, key)) { // step

      groups[key] = [];
    }
    groups[key].push(item);
  }
  return groups;
}

function countBy(items, keyFn) { // step

  const counts = {};
  for (const item of items) { // step

    const key = String(keyFn(item));
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function partition(items, predicate) { // step

  const matched = [];
  const rest = [];
  for (const item of items) { // step

    if (predicate(item)) { // step

      matched.push(item);
    } else { // step

      rest.push(item);
    }
  }
  return [matched, rest];
}

module.exports = { groupBy, countBy, partition };
