def find_index(sorted_list, needle):
    left = 0
    right = len(sorted_list) - 1
    steps = 0
    while left <= right:
        middle = (left + right) // 2
        current = sorted_list[middle]
        steps += 1
        if current == needle:
            return middle
        if current < needle:
            left = middle + 1
        else:
            right = middle - 1
    return -1


def find_insert_slot(sorted_list, needle):
    left = 0
    right = len(sorted_list)
    while left < right:
        middle = (left + right) // 2
        if sorted_list[middle] < needle:
            left = middle + 1
        else:
            right = middle
    return left
