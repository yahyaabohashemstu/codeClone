def identity(size):
    return [[float(i == j) for j in range(size)] for i in range(size)]


def transpose(matrix):
    return [list(column) for column in zip(*matrix)] if matrix else []


def multiply(a, b):
    if len(a[0]) != len(b):
        raise ValueError("incompatible dimensions")
    b_columns = list(zip(*b))
    return [
        [sum(x * y for x, y in zip(row, column)) for column in b_columns]
        for row in a
    ]
