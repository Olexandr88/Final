/**
 * Streaming Response Handler for LLM Agents
 * Enables chunked delivery of large responses for better UX
 */

import { EventEmitter } from 'events';

export class StreamingResponseHandler extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      chunkSize: options.chunkSize || 100, // characters per chunk
      chunkDelay: options.chunkDelay || 50, // ms between chunks
      enableCompression: options.enableCompression ?? true,
      ...options
    };

    this.activeStreams = new Map();
    this.stats = {
      totalStreams: 0,
      activeStreams: 0,
      totalChunksSent: 0,
      totalBytesSent: 0
    };
  }

  /**
   * Create streaming response for a message
   * @param {string} streamId - Unique stream identifier
   * @param {string} fullResponse - Complete response to stream
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<void>}
   */
  async streamResponse(streamId, fullResponse, onChunk) {
    if (this.activeStreams.has(streamId)) {
      throw new Error(`Stream ${streamId} already active`);
    }

    this.stats.totalStreams++;
    this.stats.activeStreams++;

    const stream = {
      id: streamId,
      fullResponse,
      position: 0,
      totalChunks: Math.ceil(fullResponse.length / this.options.chunkSize),
      chunksSent: 0,
      startTime: Date.now(),
      paused: false,
      cancelled: false
    };

    this.activeStreams.set(streamId, stream);
    this.emit('streamStarted', { streamId, totalChunks: stream.totalChunks });

    try {
      while (stream.position < fullResponse.length && !stream.cancelled) {
        // Check if paused
        while (stream.paused && !stream.cancelled) {
          await this._sleep(100);
        }

        if (stream.cancelled) break;

        const chunk = fullResponse.slice(
          stream.position,
          stream.position + this.options.chunkSize
        );

        stream.position += chunk.length;
        stream.chunksSent++;
        this.stats.totalChunksSent++;
        this.stats.totalBytesSent += chunk.length;

        const chunkData = {
          streamId,
          chunk,
          chunkNumber: stream.chunksSent,
          totalChunks: stream.totalChunks,
          position: stream.position,
          totalLength: fullResponse.length,
          isLast: stream.position >= fullResponse.length
        };

        await onChunk(chunkData);
        this.emit('chunk', chunkData);

        if (stream.position < fullResponse.length) {
          await this._sleep(this.options.chunkDelay);
        }
      }

      if (!stream.cancelled) {
        this.emit('streamCompleted', {
          streamId,
          duration: Date.now() - stream.startTime,
          totalChunks: stream.chunksSent
        });
      } else {
        this.emit('streamCancelled', { streamId });
      }

    } catch (error) {
      this.emit('streamError', { streamId, error: error.message });
      throw error;
    } finally {
      this.activeStreams.delete(streamId);
      this.stats.activeStreams--;
    }
  }

  /**
   * Create streaming iterator for async consumption
   * @param {string} streamId - Unique stream identifier
   * @param {string} fullResponse - Complete response to stream
   * @returns {AsyncGenerator} Async iterator yielding chunks
   */
  async *streamIterator(streamId, fullResponse) {
    const chunks = [];
    let resolveChunk = null;
    let rejectChunk = null;
    let done = false;

    const onChunk = async (chunkData) => {
      if (resolveChunk) {
        resolveChunk(chunkData);
        resolveChunk = null;
      } else {
        chunks.push(chunkData);
      }
    };

    // Start streaming in background
    this.streamResponse(streamId, fullResponse, onChunk)
      .then(() => { done = true; })
      .catch((error) => {
        if (rejectChunk) {
          rejectChunk(error);
        }
      });

    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift();
      } else if (!done) {
        const chunk = await new Promise((resolve, reject) => {
          resolveChunk = resolve;
          rejectChunk = reject;
        });
        yield chunk;
      }
    }
  }

  /**
   * Pause active stream
   */
  pauseStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.paused = true;
      this.emit('streamPaused', { streamId });
    }
  }

  /**
   * Resume paused stream
   */
  resumeStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.paused = false;
      this.emit('streamResumed', { streamId });
    }
  }

  /**
   * Cancel active stream
   */
  cancelStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.cancelled = true;
      this.emit('streamCancelled', { streamId });
    }
  }

  /**
   * Get stream status
   */
  getStreamStatus(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      return { active: false };
    }

    return {
      active: true,
      progress: (stream.position / stream.fullResponse.length) * 100,
      chunksSent: stream.chunksSent,
      totalChunks: stream.totalChunks,
      paused: stream.paused,
      duration: Date.now() - stream.startTime
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageChunkSize: this.stats.totalChunksSent > 0
        ? Math.round(this.stats.totalBytesSent / this.stats.totalChunksSent)
        : 0
    };
  }

  /**
   * Helper: sleep for ms
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cancel all active streams
   */
  cancelAllStreams() {
    for (const streamId of this.activeStreams.keys()) {
      this.cancelStream(streamId);
    }
  }
}

/**
 * Simple helper for streaming text responses
 * @param {string} text - Text to stream
 * @param {Function} onChunk - Callback for each chunk
 * @param {number} chunkSize - Characters per chunk
 * @param {number} delay - Delay between chunks (ms)
 */
export async function streamText(text, onChunk, chunkSize = 100, delay = 50) {
  const handler = new StreamingResponseHandler({ chunkSize, chunkDelay: delay });
  const streamId = `stream-${Date.now()}-${Math.random()}`;
  await handler.streamResponse(streamId, text, onChunk);
}

export default StreamingResponseHandler;
