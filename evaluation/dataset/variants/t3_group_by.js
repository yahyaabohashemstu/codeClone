function bucketize(records, selector) {
  const buckets = {};
  for (const record of records) {
    const bucketKey = String(selector(record));
    if (!Object.prototype.hasOwnProperty.call(buckets, bucketKey)) {
      buckets[bucketKey] = [];
    }
    buckets[bucketKey].push(record);
  }
  return buckets;
}

function tally(records, selector) {
  const totals = {};
  for (const record of records) {
    const bucketKey = String(selector(record));
    totals[bucketKey] = (totals[bucketKey] || 0) + 1;
  }
  return totals;
}

function largestBucket(records, selector) {
  const buckets = bucketize(records, selector);
  let bestKey = null;
  let bestSize = -1;
  for (const [bucketKey, bucket] of Object.entries(buckets)) {
    if (bucket.length > bestSize) {
      bestSize = bucket.length;
      bestKey = bucketKey;
    }
  }
  return bestKey;
}

module.exports = { bucketize, tally, largestBucket };
