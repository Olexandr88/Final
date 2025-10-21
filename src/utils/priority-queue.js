/**
 * Priority Queue for Message Routing
 * Implements heap-based priority queue for efficient message handling
 */

export class PriorityQueue {
  constructor() {
    this.heap = [];
    this.priorities = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };
  }

  enqueue(item, priority = 'normal') {
    const priorityValue = this.priorities[priority] ?? 2;
    const element = { item, priority: priorityValue, timestamp: Date.now() };

    this.heap.push(element);
    this._bubbleUp(this.heap.length - 1);
  }

  dequeue() {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop().item;

    const root = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._bubbleDown(0);

    return root.item;
  }

  peek() {
    return this.heap.length > 0 ? this.heap[0].item : null;
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      if (this._compare(this.heap[index], this.heap[parentIndex]) >= 0) break;

      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  _bubbleDown(index) {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < this.heap.length &&
        this._compare(this.heap[leftChild], this.heap[smallest]) < 0
      ) {
        smallest = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this._compare(this.heap[rightChild], this.heap[smallest]) < 0
      ) {
        smallest = rightChild;
      }

      if (smallest === index) break;

      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }

  _compare(a, b) {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.timestamp - b.timestamp;
  }

  getStats() {
    const stats = {
      total: this.heap.length,
      byPriority: { critical: 0, high: 0, normal: 0, low: 0 },
    };

    for (const element of this.heap) {
      const priorityName = Object.keys(this.priorities).find(
        (key) => this.priorities[key] === element.priority
      );
      if (priorityName) {
        stats.byPriority[priorityName]++;
      }
    }

    return stats;
  }
}
