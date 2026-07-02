from collections import OrderedDict


class LRUCache:
    def __init__(self, capacity):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self.entries = OrderedDict()
        self.hits = 0
        self.misses = 0

    def get(self, key):
        if key not in self.entries:
            self.misses += 1
            return None
        self.entries.move_to_end(key)
        self.hits += 1
        return self.entries[key]

    def put(self, key, value):
        if key in self.entries:
            self.entries.move_to_end(key)
        self.entries[key] = value
        if len(self.entries) > self.capacity:
            self.entries.popitem(last=False)

    def stats(self):
        total = self.hits + self.misses
        ratio = self.hits / total if total else 0.0
        return {"hits": self.hits, "misses": self.misses, "hit_ratio": ratio}
