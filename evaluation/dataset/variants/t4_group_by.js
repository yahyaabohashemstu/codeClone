const groupBy = (items, keyFn) =>
  items.reduce((groups, item) => {
    const key = String(keyFn(item));
    return { ...groups, [key]: [...(groups[key] ?? []), item] };
  }, {});

const countBy = (items, keyFn) =>
  Object.fromEntries(
    Object.entries(groupBy(items, keyFn)).map(([key, group]) => [key, group.length]),
  );

const partition = (items, predicate) =>
  items.reduce(
    ([pass, fail], item) =>
      predicate(item) ? [[...pass, item], fail] : [pass, [...fail, item]],
    [[], []],
  );

module.exports = { groupBy, countBy, partition };
