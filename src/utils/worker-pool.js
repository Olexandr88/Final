/**
 * Worker Thread Pool for Parallel Processing
 * Provides efficient worker thread management for CPU-intensive tasks
 */
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { logger } from './logger.js';

export class WorkerPool {
  constructor(workerPath, options = {}) {
    this.workerPath = workerPath;
    this.poolSize = options.poolSize || cpus().length;
    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
    this.activeWorkers = new Map();

    // Initialize pool
    for (let i = 0; i < this.poolSize; i++) {
      this.createWorker(i);
    }

    logger.info(`WorkerPool initialized with ${this.poolSize} workers for ${workerPath}`);
  }

  createWorker(id) {
    const worker = new Worker(this.workerPath, {
      workerData: { workerId: id }
    });

    worker.workerId = id;

    worker.on('message', (result) => {
      this.handleWorkerResult(worker, result);
    });

    worker.on('error', (error) => {
      logger.error(`Worker ${id} error:`, error);
      this.handleWorkerError(worker, error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        logger.warn(`Worker ${id} exited with code ${code}`);
        // Recreate worker
        this.recreateWorker(worker);
      }
    });

    this.workers.push(worker);
    this.availableWorkers.push(worker);
    return worker;
  }

  recreateWorker(oldWorker) {
    const index = this.workers.indexOf(oldWorker);
    if (index !== -1) {
      this.workers.splice(index, 1);
      const newWorker = this.createWorker(oldWorker.workerId);

      // If old worker had a task, reject it
      if (this.activeWorkers.has(oldWorker)) {
        const task = this.activeWorkers.get(oldWorker);
        task.reject(new Error('Worker crashed'));
        this.activeWorkers.delete(oldWorker);
      }
    }
  }

  async execute(data, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const task = {
        data,
        resolve,
        reject,
        timeout: setTimeout(() => {
          reject(new Error('Worker task timeout'));
          this.handleTaskTimeout(task);
        }, timeout)
      };

      if (this.availableWorkers.length > 0) {
        this.assignTask(task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  assignTask(task) {
    const worker = this.availableWorkers.pop();
    this.activeWorkers.set(worker, task);
    worker.postMessage(task.data);
  }

  handleWorkerResult(worker, result) {
    const task = this.activeWorkers.get(worker);
    if (!task) return;

    clearTimeout(task.timeout);
    this.activeWorkers.delete(worker);

    if (result.error) {
      task.reject(new Error(result.error));
    } else {
      task.resolve(result.data);
    }

    // Process next task or return worker to pool
    if (this.taskQueue.length > 0) {
      this.assignTask(this.taskQueue.shift());
    } else {
      this.availableWorkers.push(worker);
    }
  }

  handleWorkerError(worker, error) {
    const task = this.activeWorkers.get(worker);
    if (task) {
      clearTimeout(task.timeout);
      task.reject(error);
      this.activeWorkers.delete(worker);
    }
  }

  handleTaskTimeout(task) {
    // Find worker with this task
    for (const [worker, activeTask] of this.activeWorkers.entries()) {
      if (activeTask === task) {
        // Terminate and recreate worker
        worker.terminate();
        this.recreateWorker(worker);
        this.activeWorkers.delete(worker);
        break;
      }
    }
  }

  getStats() {
    return {
      poolSize: this.poolSize,
      available: this.availableWorkers.length,
      active: this.activeWorkers.size,
      queued: this.taskQueue.length
    };
  }

  async terminate() {
    logger.info('Terminating worker pool...');

    // Clear queue
    for (const task of this.taskQueue) {
      clearTimeout(task.timeout);
      task.reject(new Error('Worker pool terminated'));
    }
    this.taskQueue = [];

    // Terminate all workers
    await Promise.all(this.workers.map(w => w.terminate()));
    this.workers = [];
    this.availableWorkers = [];
    this.activeWorkers.clear();

    logger.info('Worker pool terminated');
  }
}

export default WorkerPool;
