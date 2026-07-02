def locate(values, wanted, start=None, end=None):
    if start is None:
        start = 0
    if end is None:
        end = len(values) - 1
    if start > end:
        return -1
    center = start + (end - start) // 2
    candidate = values[center]
    if candidate == wanted:
        return center
    if candidate < wanted:
        return locate(values, wanted, center + 1, end)
    return locate(values, wanted, start, center - 1)


def slot_for(values, wanted):
    if not values:
        return 0
    if wanted <= values[0]:
        return 0
    if wanted > values[-1]:
        return len(values)
    return _slot_recursive(values, wanted, 0, len(values))


def _slot_recursive(values, wanted, start, end):
    if start >= end:
        return start
    center = start + (end - start) // 2
    if values[center] < wanted:
        return _slot_recursive(values, wanted, center + 1, end)
    return _slot_recursive(values, wanted, start, center)


def has_value(values, wanted):
    return locate(values, wanted) >= 0
