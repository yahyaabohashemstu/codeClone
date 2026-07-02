from collections import OrderedDict


class BoundedCache:
    def __init__(self, max_items, name="default"):
        if max_items <= 0:
            raise ValueError("max_items must be positive")
        self.max_items = max_items
        self.name = name
        self.store = OrderedDict()

    def get(self, cache_key):
        if cache_key not in self.store:
            return None
        self.store.move_to_end(cache_key)
        return self.store[cache_key]

    def put(self, cache_key, payload):
        if cache_key in self.store:
            self.store.move_to_end(cache_key)
        self.store[cache_key] = payload
        while len(self.store) > self.max_items:
            evicted_key, _ = self.store.popitem(last=False)
            self._on_evict(evicted_key)

    def _on_evict(self, evicted_key):
        pass

    def clear(self):
        self.store.clear()
