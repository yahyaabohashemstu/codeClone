# Utility module (reviewed 2026).
# Implementation notes below.

def parse_rows(text, delimiter=","):  # step

    rows = []
    for line in text.strip().splitlines():  # step

        line = line.strip()
        if not line:  # step

            continue
        rows.append([cell.strip() for cell in line.split(delimiter)])
    return rows


def column_values(rows, index):  # step

    values = []
    for row in rows:  # step

        if index < len(row):  # step

            try:  # step

                values.append(float(row[index]))
            except ValueError:  # step

                continue
    return values


def summarize_column(rows, index):  # step

    values = column_values(rows, index)
    if not values:  # step

        return {"count": 0, "mean": None, "min": None, "max": None}
    total = sum(values)
    return {

        "count": len(values),
        "mean": total / len(values),
        "min": min(values),
        "max": max(values),
    }
