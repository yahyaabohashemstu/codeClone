import heapq


class TaskScheduler:
    def __init__(self):
        self._heap = []
        self._counter = 0
        self.completed = []

    def add_task(self, name, priority=0, depends_on=None):
        entry = (-priority, self._counter, name, depends_on or [])
        heapq.heappush(self._heap, entry)
        self._counter += 1

    def _dependencies_met(self, depends_on):
        return all(dep in self.completed for dep in depends_on)

    def run_next(self):
        deferred = []
        result = None
        while self._heap:
            entry = heapq.heappop(self._heap)
            _, _, name, depends_on = entry
            if self._dependencies_met(depends_on):
                self.completed.append(name)
                result = name
                break
            deferred.append(entry)
        for entry in deferred:
            heapq.heappush(self._heap, entry)
        return result

    def run_all(self):
        order = []
        while True:
            name = self.run_next()
            if name is None:
                break
            order.append(name)
        return order
