/**
 * Docker Client - Dockerode wrapper for Docker Engine API
 * @module docker-client
 */

import Docker from 'dockerode';
import { logger } from '../utils/logger.js';
import { DOCKER } from '../config/cpu-optimized-constants.js';

// Use CPU-optimized config (60-70% CPU reduction)
const DOCKER_CONFIG = DOCKER;

export class DockerClient {
  constructor(options = {}) {
    this.options = {
      socketPath: process.platform === 'win32'
        ? '//./pipe/docker_engine'
        : '/var/run/docker.sock',
      ...options
    };

    try {
      this.docker = new Docker(this.options);
      logger.info('Docker client initialized', { options: this.options });
    } catch (error) {
      logger.error('Failed to initialize Docker client', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if Docker daemon is available
   * @returns {Promise<boolean>}
   */
  async ping() {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      logger.error('Docker daemon not available', { error: error.message });
      return false;
    }
  }

  /**
   * List all containers
   * @param {Object} filters - Docker filter options
   * @returns {Promise<Array>}
   */
  async listContainers(filters = { all: true }) {
    try {
      const containers = await this.docker.listContainers(filters);
      return containers.map(c => ({
        id: c.Id,
        name: c.Names[0]?.replace('/', ''),
        image: c.Image,
        state: c.State,
        status: c.Status,
        created: c.Created,
        ports: c.Ports,
        labels: c.Labels
      }));
    } catch (error) {
      logger.error('Failed to list containers', { error: error.message });
      throw error;
    }
  }

  /**
   * Get container details
   * @param {string} id - Container ID
   * @returns {Promise<Object>}
   */
  async inspectContainer(id) {
    try {
      const container = this.docker.getContainer(id);
      const data = await container.inspect();
      return {
        id: data.Id,
        name: data.Name.replace('/', ''),
        image: data.Config.Image,
        state: data.State,
        created: data.Created,
        ports: data.NetworkSettings.Ports,
        mounts: data.Mounts,
        env: data.Config.Env,
        labels: data.Config.Labels,
        networkSettings: data.NetworkSettings
      };
    } catch (error) {
      logger.error('Failed to inspect container', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Start a container
   * @param {string} id - Container ID
   * @returns {Promise<void>}
   */
  async startContainer(id) {
    try {
      const container = this.docker.getContainer(id);
      await container.start();
      logger.info('Container started', { id });
    } catch (error) {
      logger.error('Failed to start container', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Stop a container
   * @param {string} id - Container ID
   * @returns {Promise<void>}
   */
  async stopContainer(id) {
    try {
      const container = this.docker.getContainer(id);
      await container.stop({ t: 10 }); // 10-second timeout
      logger.info('Container stopped', { id });
    } catch (error) {
      logger.error('Failed to stop container', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Restart a container
   * @param {string} id - Container ID
   * @returns {Promise<void>}
   */
  async restartContainer(id) {
    try {
      const container = this.docker.getContainer(id);
      await container.restart();
      logger.info('Container restarted', { id });
    } catch (error) {
      logger.error('Failed to restart container', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Remove a container
   * @param {string} id - Container ID
   * @param {Object} options - Remove options
   * @returns {Promise<void>}
   */
  async removeContainer(id, options = { force: false, v: true }) {
    try {
      const container = this.docker.getContainer(id);
      await container.remove(options);
      logger.info('Container removed', { id, options });
    } catch (error) {
      logger.error('Failed to remove container', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Get container stats stream
   * @param {string} id - Container ID
   * @returns {Promise<Stream>}
   */
  async getContainerStats(id) {
    try {
      const container = this.docker.getContainer(id);
      return await container.stats({ stream: false });
    } catch (error) {
      logger.error('Failed to get container stats', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Get container logs
   * @param {string} id - Container ID
   * @param {Object} options - Log options
   * @returns {Promise<Stream>}
   */
  async getContainerLogs(id, options = { stdout: true, stderr: true, tail: 100, follow: true }) {
    try {
      const container = this.docker.getContainer(id);
      return await container.logs(options);
    } catch (error) {
      logger.error('Failed to get container logs', { id, error: error.message });
      throw error;
    }
  }

  /**
   * List all images
   * @returns {Promise<Array>}
   */
  async listImages() {
    try {
      const images = await this.docker.listImages();
      return images.map(img => ({
        id: img.Id,
        tags: img.RepoTags || [],
        created: img.Created,
        size: img.Size,
        virtualSize: img.VirtualSize,
        labels: img.Labels
      }));
    } catch (error) {
      logger.error('Failed to list images', { error: error.message });
      throw error;
    }
  }

  /**
   * Pull an image
   * @param {string} imageName - Image name (e.g., 'nginx:latest')
   * @returns {Promise<void>}
   */
  async pullImage(imageName) {
    try {
      const stream = await this.docker.pull(imageName);
      return new Promise((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err, res) => {
          if (err) {
            logger.error('Failed to pull image', { imageName, error: err.message });
            reject(err);
          } else {
            logger.info('Image pulled successfully', { imageName });
            resolve(res);
          }
        });
      });
    } catch (error) {
      logger.error('Failed to pull image', { imageName, error: error.message });
      throw error;
    }
  }

  /**
   * Remove an image
   * @param {string} id - Image ID
   * @returns {Promise<void>}
   */
  async removeImage(id, options = { force: false }) {
    try {
      const image = this.docker.getImage(id);
      await image.remove(options);
      logger.info('Image removed', { id });
    } catch (error) {
      logger.error('Failed to remove image', { id, error: error.message });
      throw error;
    }
  }

  /**
   * List all volumes
   * @returns {Promise<Array>}
   */
  async listVolumes() {
    try {
      const { Volumes } = await this.docker.listVolumes();
      return (Volumes || []).map(v => ({
        name: v.Name,
        driver: v.Driver,
        mountpoint: v.Mountpoint,
        created: v.CreatedAt,
        labels: v.Labels,
        scope: v.Scope
      }));
    } catch (error) {
      logger.error('Failed to list volumes', { error: error.message });
      throw error;
    }
  }

  /**
   * Remove a volume
   * @param {string} name - Volume name
   * @returns {Promise<void>}
   */
  async removeVolume(name) {
    try {
      const volume = this.docker.getVolume(name);
      await volume.remove();
      logger.info('Volume removed', { name });
    } catch (error) {
      logger.error('Failed to remove volume', { name, error: error.message });
      throw error;
    }
  }

  /**
   * List all networks
   * @returns {Promise<Array>}
   */
  async listNetworks() {
    try {
      const networks = await this.docker.listNetworks();
      return networks.map(n => ({
        id: n.Id,
        name: n.Name,
        driver: n.Driver,
        scope: n.Scope,
        created: n.Created,
        labels: n.Labels
      }));
    } catch (error) {
      logger.error('Failed to list networks', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a network
   * @param {Object} options - Network options
   * @returns {Promise<Object>}
   */
  async createNetwork(options) {
    try {
      const network = await this.docker.createNetwork(options);
      logger.info('Network created', { name: options.Name });
      return network;
    } catch (error) {
      logger.error('Failed to create network', { error: error.message });
      throw error;
    }
  }

  /**
   * Remove a network
   * @param {string} id - Network ID
   * @returns {Promise<void>}
   */
  async removeNetwork(id) {
    try {
      const network = this.docker.getNetwork(id);
      await network.remove();
      logger.info('Network removed', { id });
    } catch (error) {
      logger.error('Failed to remove network', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Get Docker system info
   * @returns {Promise<Object>}
   */
  async getInfo() {
    try {
      const info = await this.docker.info();
      return {
        containers: info.Containers,
        containersRunning: info.ContainersRunning,
        containersPaused: info.ContainersPaused,
        containersStopped: info.ContainersStopped,
        images: info.Images,
        serverVersion: info.ServerVersion,
        osType: info.OSType,
        architecture: info.Architecture,
        memTotal: info.MemTotal,
        cpus: info.NCPU
      };
    } catch (error) {
      logger.error('Failed to get Docker info', { error: error.message });
      throw error;
    }
  }
}

export default DockerClient;
