def identity(size):
    matrix = []
    for row_index in range(size):
        row = []
        for col_index in range(size):
            row.append(1.0 if row_index == col_index else 0.0)
        matrix.append(row)
    return matrix


def transpose(matrix):
    if not matrix:
        return []
    rows = len(matrix)
    cols = len(matrix[0])
    result = []
    for col_index in range(cols):
        new_row = []
        for row_index in range(rows):
            new_row.append(matrix[row_index][col_index])
        result.append(new_row)
    return result


def multiply(a, b):
    rows_a = len(a)
    cols_a = len(a[0])
    cols_b = len(b[0])
    if cols_a != len(b):
        raise ValueError("incompatible dimensions")
    result = []
    for i in range(rows_a):
        row = []
        for j in range(cols_b):
            total = 0.0
            for k in range(cols_a):
                total += a[i][k] * b[k][j]
            row.append(total)
        result.append(row)
    return result
