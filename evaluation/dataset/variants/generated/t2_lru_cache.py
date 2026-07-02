from collections import OrderedDict


class RecentMap:
    def __init__(self, limit):
        if limit <= 0:
            raise ValueError("limit must be positive")
        self.limit = limit
        self.data = OrderedDict()
        self.hit_count = 0
        self.miss_count = 0

    def get(self, k):
        if k not in self.data:
            self.miss_count += 1
            return None
        self.data.move_to_end(k)
        self.hit_count += 1
        return self.data[k]

    def put(self, k, v):
        if k in self.data:
            self.data.move_to_end(k)
        self.data[k] = v
        if len(self.data) > self.limit:
            self.data.popitem(last=False)

    def metrics(self):
        n = self.hit_count + self.miss_count
        rate = self.hit_count / n if n else 0.0
        return {"hit_count": self.hit_count, "miss_count": self.miss_count, "hit_ratio": rate}
