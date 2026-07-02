class BoundedStack:
    def __init__(self, capacity):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self.items = []
        self.pushes = 0
        self.pops = 0

    def push(self, value):
        if len(self.items) >= self.capacity:
            raise OverflowError("stack is full")
        self.items.append(value)
        self.pushes += 1

    def pop(self):
        if not self.items:
            raise IndexError("stack is empty")
        self.pops += 1
        return self.items.pop()

    def peek(self):
        if not self.items:
            return None
        return self.items[-1]

    def drain(self):
        drained = []
        while self.items:
            drained.append(self.pop())
        return drained
