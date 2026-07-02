def group_by(items, key_fn):
    groups = {}
    for item in items:
        key = str(key_fn(item))
        if key not in groups:
            groups[key] = []
        groups[key].append(item)
    return groups


def count_by(items, key_fn):
    counts = {}
    for item in items:
        key = str(key_fn(item))
        counts[key] = counts.get(key, 0) + 1
    return counts


def partition(items, predicate):
    matched = []
    rest = []
    for item in items:
        if predicate(item):
            matched.append(item)
        else:
            rest.append(item)
    return matched, rest
