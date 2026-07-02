def read_table(raw, sep=","):
    table = []
    for ln in raw.strip().splitlines():
        ln = ln.strip()
        if not ln:
            continue
        table.append([field.strip() for field in ln.split(sep)])
    return table


def col_nums(table, col):
    nums = []
    for rec in table:
        if col < len(rec):
            try:
                nums.append(float(rec[col]))
            except ValueError:
                continue
    return nums


def col_summary(table, col):
    nums = col_nums(table, col)
    if not nums:
        return {"count": 0, "mean": None, "min": None, "max": None}
    acc = sum(nums)
    return {
        "count": len(nums),
        "mean": acc / len(nums),
        "min": min(nums),
        "max": max(nums),
    }
