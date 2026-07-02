import re

_NON_WORD = re.compile(r"[^a-z0-9]+")


def slugify(title, separator="-"):
    lowered = title.lower()
    collapsed = _NON_WORD.sub(separator, lowered)
    return collapsed.strip(separator)


def truncate_slug(slug, max_length, separator="-"):
    if len(slug) <= max_length:
        return slug
    pattern = re.compile(re.escape(separator) + r"[^" + re.escape(separator) + r"]*$")
    cut = slug[:max_length]
    shortened = pattern.sub("", cut)
    return shortened if separator in cut else cut


def unique_slug(candidate, existing):
    if candidate not in existing:
        return candidate
    numbered = (f"{candidate}-{n}" for n in range(2, len(existing) + 3))
    return next(name for name in numbered if name not in existing)
