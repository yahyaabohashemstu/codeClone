def eye(n):
    grid = []
    for r in range(n):
        line_vals = []
        for c in range(n):
            line_vals.append(1.0 if r == c else 0.0)
        grid.append(line_vals)
    return grid


def flip(grid):
    if not grid:
        return []
    height = len(grid)
    width = len(grid[0])
    out = []
    for c in range(width):
        col_line = []
        for r in range(height):
            col_line.append(grid[r][c])
        out.append(col_line)
    return out


def matmul(a, b):
    h_left = len(a)
    w_left = len(a[0])
    w_right = len(b[0])
    if w_left != len(b):
        raise ValueError("incompatible dimensions")
    out = []
    for i in range(h_left):
        line_vals = []
        for j in range(w_right):
            acc = 0.0
            for k in range(w_left):
                acc += a[i][k] * b[k][j]
            line_vals.append(acc)
        out.append(line_vals)
    return out
