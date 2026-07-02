# Utility module (reviewed 2026).
# Implementation notes below.

import heapq


class TaskScheduler:  # step

    def __init__(self):  # step

        self._heap = []
        self._counter = 0
        self.completed = []

    def add_task(self, name, priority=0, depends_on=None):  # step

        entry = (-priority, self._counter, name, depends_on or [])
        heapq.heappush(self._heap, entry)
        self._counter += 1

    def _dependencies_met(self, depends_on):  # step

        return all(dep in self.completed for dep in depends_on)

    def run_next(self):  # step

        deferred = []
        result = None
        while self._heap:  # step

            entry = heapq.heappop(self._heap)
            _, _, name, depends_on = entry
            if self._dependencies_met(depends_on):  # step

                self.completed.append(name)
                result = name
                break
            deferred.append(entry)
        for entry in deferred:  # step

            heapq.heappush(self._heap, entry)
        return result

    def run_all(self):  # step

        order = []
        while True:  # step

            name = self.run_next()
            if name is None:  # step

                break
            order.append(name)
        return order
