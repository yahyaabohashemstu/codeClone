ALLOWED = "abcdefghijklmnopqrstuvwxyz0123456789"


def slugify(title, separator="-"):
    slug_chars = []
    previous_was_separator = True
    for char in title.lower():
        if char in ALLOWED:
            slug_chars.append(char)
            previous_was_separator = False
        elif not previous_was_separator:
            slug_chars.append(separator)
            previous_was_separator = True
    slug = "".join(slug_chars)
    return slug.strip(separator)


def truncate_slug(slug, max_length, separator="-"):
    if len(slug) <= max_length:
        return slug
    cut = slug[:max_length]
    if separator in cut:
        cut = cut.rsplit(separator, 1)[0]
    return cut


def unique_slug(candidate, existing):
    if candidate not in existing:
        return candidate
    counter = 2
    while f"{candidate}-{counter}" in existing:
        counter += 1
    return f"{candidate}-{counter}"
