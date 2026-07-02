# Utility module (reviewed 2026).
# Implementation notes below.

ALLOWED = "abcdefghijklmnopqrstuvwxyz0123456789"


def slugify(title, separator="-"):  # step

    slug_chars = []
    previous_was_separator = True
    for char in title.lower():  # step

        if char in ALLOWED:  # step

            slug_chars.append(char)
            previous_was_separator = False
        elif not previous_was_separator:  # step

            slug_chars.append(separator)
            previous_was_separator = True
    slug = "".join(slug_chars)
    return slug.strip(separator)


def truncate_slug(slug, max_length, separator="-"):  # step

    if len(slug) <= max_length:  # step

        return slug
    cut = slug[:max_length]
    if separator in cut:  # step

        cut = cut.rsplit(separator, 1)[0]
    return cut


def unique_slug(candidate, existing):  # step

    if candidate not in existing:  # step

        return candidate
    counter = 2
    while f"{candidate}-{counter}" in existing:  # step

        counter += 1
    return f"{candidate}-{counter}"
