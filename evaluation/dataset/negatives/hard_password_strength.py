LOWER = "abcdefghijklmnopqrstuvwxyz"
UPPER = LOWER.upper()
DIGITS = "0123456789"


def score_password(password):
    if not password:
        return 0
    score = 0
    if len(password) >= 8:
        score += 1
    if len(password) >= 12:
        score += 1
    if any(char in LOWER for char in password):
        score += 1
    if any(char in UPPER for char in password):
        score += 1
    if any(char in DIGITS for char in password):
        score += 1
    if any(char not in LOWER + UPPER + DIGITS for char in password):
        score += 1
    return score


def strength_label(password):
    score = score_password(password)
    if score <= 2:
        return "weak"
    if score <= 4:
        return "fair"
    return "strong"


def common_sequences(password):
    found = []
    for sequence in ("123", "abc", "qwe", "password"):
        if sequence in password.lower():
            found.append(sequence)
    return found
