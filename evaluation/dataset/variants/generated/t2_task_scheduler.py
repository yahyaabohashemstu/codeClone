import heapq


class JobQueue:
    def __init__(self):
        self._pq = []
        self._seq = 0
        self.done = []

    def enqueue(self, job_name, prio=0, prereqs=None):
        item = (-prio, self._seq, job_name, prereqs or [])
        heapq.heappush(self._pq, item)
        self._seq += 1

    def _ready(self, prereqs):
        return all(req in self.done for req in prereqs)

    def pop_ready(self):
        parked = []
        picked = None
        while self._pq:
            item = heapq.heappop(self._pq)
            _, _, job_name, prereqs = item
            if self._ready(prereqs):
                self.done.append(job_name)
                picked = job_name
                break
            parked.append(item)
        for item in parked:
            heapq.heappush(self._pq, item)
        return picked

    def drain(self):
        sequence = []
        while True:
            job_name = self.pop_ready()
            if job_name is None:
                break
            sequence.append(job_name)
        return sequence
