def parse_log_line(line):
    parts = line.split(" ", 3)
    if len(parts) < 4:
        return None
    timestamp, level, source, message = parts
    if level not in {"DEBUG", "INFO", "WARN", "ERROR"}:
        return None
    return {
        "timestamp": timestamp,
        "level": level,
        "source": source.strip("[]"),
        "message": message.strip(),
    }


def error_rate(lines):
    total = 0
    errors = 0
    for line in lines:
        entry = parse_log_line(line)
        if entry is None:
            continue
        total += 1
        if entry["level"] == "ERROR":
            errors += 1
    return errors / total if total else 0.0


def busiest_source(lines):
    counts = {}
    for line in lines:
        entry = parse_log_line(line)
        if entry is None:
            continue
        counts[entry["source"]] = counts.get(entry["source"], 0) + 1
    best = None
    for source, count in counts.items():
        if best is None or count > counts[best]:
            best = source
    return best
