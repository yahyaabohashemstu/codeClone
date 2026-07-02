VALID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"


def make_slug(text, joiner="-", max_length=None):
    parts = []
    last_was_joiner = True
    for symbol in text.lower():
        if symbol in VALID_CHARS:
            parts.append(symbol)
            last_was_joiner = False
        elif not last_was_joiner:
            parts.append(joiner)
            last_was_joiner = True
    result = "".join(parts).strip(joiner)
    if max_length is not None and len(result) > max_length:
        trimmed = result[:max_length]
        if joiner in trimmed:
            trimmed = trimmed.rsplit(joiner, 1)[0]
        result = trimmed
    return result


def dedupe_slug(base, taken):
    if base not in taken:
        return base
    suffix = 2
    while f"{base}-{suffix}" in taken:
        suffix += 1
    return f"{base}-{suffix}"
