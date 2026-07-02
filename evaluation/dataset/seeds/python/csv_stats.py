def parse_rows(text, delimiter=","):
    rows = []
    for line in text.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append([cell.strip() for cell in line.split(delimiter)])
    return rows


def column_values(rows, index):
    values = []
    for row in rows:
        if index < len(row):
            try:
                values.append(float(row[index]))
            except ValueError:
                continue
    return values


def summarize_column(rows, index):
    values = column_values(rows, index)
    if not values:
        return {"count": 0, "mean": None, "min": None, "max": None}
    total = sum(values)
    return {
        "count": len(values),
        "mean": total / len(values),
        "min": min(values),
        "max": max(values),
    }
