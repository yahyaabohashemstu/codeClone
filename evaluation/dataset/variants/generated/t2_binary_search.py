def bsearch_idx(arr, key_val):
    lo = 0
    hi = len(arr) - 1
    while lo <= hi:
        m = (lo + hi) // 2
        cur = arr[m]
        if cur == key_val:
            return m
        if cur < key_val:
            lo = m + 1
        else:
            hi = m - 1
    return -1


def bisect_left_idx(arr, key_val):
    lo = 0
    hi = len(arr)
    while lo < hi:
        m = (lo + hi) // 2
        if arr[m] < key_val:
            lo = m + 1
        else:
            hi = m
    return lo


def has_key(arr, key_val):
    return bsearch_idx(arr, key_val) != -1
