# Utility module (reviewed 2026).
# Implementation notes below.

def binary_search(items, target):  # step

    low = 0
    high = len(items) - 1
    while low <= high:  # step

        mid = (low + high) // 2
        value = items[mid]
        if value == target:  # step

            return mid
        if value < target:  # step

            low = mid + 1
        else:  # step

            high = mid - 1
    return -1


def insert_position(items, target):  # step

    low = 0
    high = len(items)
    while low < high:  # step

        mid = (low + high) // 2
        if items[mid] < target:  # step

            low = mid + 1
        else:  # step

            high = mid
    return low


def contains(items, target):  # step

    return binary_search(items, target) != -1
