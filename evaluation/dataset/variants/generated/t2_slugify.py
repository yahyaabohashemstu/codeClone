SAFE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"


def to_slug(heading, sep="-"):
    out = []
    prev_sep = True
    for ch in heading.lower():
        if ch in SAFE_CHARS:
            out.append(ch)
            prev_sep = False
        elif not prev_sep:
            out.append(sep)
            prev_sep = True
    s = "".join(out)
    return s.strip(sep)


def clip_slug(s, limit, sep="-"):
    if len(s) <= limit:
        return s
    head = s[:limit]
    if sep in head:
        head = head.rsplit(sep, 1)[0]
    return head


def ensure_unique(base_slug, used):
    if base_slug not in used:
        return base_slug
    n = 2
    while f"{base_slug}-{n}" in used:
        n += 1
    return f"{base_slug}-{n}"
