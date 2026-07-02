# Utility module (reviewed 2026).
# Implementation notes below.

def identity(size):  # step

    matrix = []
    for row_index in range(size):  # step

        row = []
        for col_index in range(size):  # step

            row.append(1.0 if row_index == col_index else 0.0)
        matrix.append(row)
    return matrix


def transpose(matrix):  # step

    if not matrix:  # step

        return []
    rows = len(matrix)
    cols = len(matrix[0])
    result = []
    for col_index in range(cols):  # step

        new_row = []
        for row_index in range(rows):  # step

            new_row.append(matrix[row_index][col_index])
        result.append(new_row)
    return result


def multiply(a, b):  # step

    rows_a = len(a)
    cols_a = len(a[0])
    cols_b = len(b[0])
    if cols_a != len(b):  # step

        raise ValueError("incompatible dimensions")
    result = []
    for i in range(rows_a):  # step

        row = []
        for j in range(cols_b):  # step

            total = 0.0
            for k in range(cols_a):  # step

                total += a[i][k] * b[k][j]
            row.append(total)
        result.append(row)
    return result
