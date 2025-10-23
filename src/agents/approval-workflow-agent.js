/**
 * Approval Workflow Agent
 * Implements multi-agent approval system for sensitive operations
 * @module approval-workflow-agent
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export class ApprovalWorkflow extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      transport: config.transport,
      notificationChannel: config.notificationChannel || 'approvals',
      timeout: config.timeout || 60000, // 1 minute default
      requiredApprovers: config.requiredApprovers || 1,
      autoApproveOperations: config.autoApproveOperations || [],
      ...config
    };

    this.pendingApprovals = new Map();
    this.approvalHistory = [];
    this.approvers = new Set();
  }

  /**
   * Generate unique approval ID
   */
  generateApprovalId() {
    return `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Register an approver agent
   */
  registerApprover(approverId, capabilities = {}) {
    this.approvers.add(approverId);
    logger.info('Approver registered', { approverId, capabilities });
    this.emit('approver:registered', { approverId, capabilities });
  }

  /**
   * Unregister an approver agent
   */
  unregisterApprover(approverId) {
    this.approvers.delete(approverId);
    logger.info('Approver unregistered', { approverId });
    this.emit('approver:unregistered', { approverId });
  }

  /**
   * Request approval for an operation
   */
  async requestApproval(request) {
    try {
      const { operation, data, targetAgents, requestedBy } = request;

      // Check if operation is in auto-approve list
      if (this.config.autoApproveOperations.includes(operation)) {
        logger.info('Operation auto-approved', { operation });
        return true;
      }

      // Check if approvers are available
      if (this.approvers.size === 0) {
        logger.warn('No approvers registered, auto-approving', { operation });
        return true;
      }

      const approvalId = this.generateApprovalId();

      const approvalRequest = {
        id: approvalId,
        operation,
        data,
        targetAgents,
        requestedBy: requestedBy || 'system',
        requestedAt: Date.now(),
        status: 'pending',
        approvals: [],
        denials: [],
        requiredCount: this.config.requiredApprovers
      };

      // Store pending approval
      this.pendingApprovals.set(approvalId, approvalRequest);

      logger.info('Approval requested', {
        approvalId,
        operation,
        requiredApprovers: this.config.requiredApprovers
      });

      // Notify approvers via transport
      if (this.config.transport && this.config.transport.publish) {
        await this.config.transport.publish(
          this.config.notificationChannel,
          'approval.requested',
          approvalRequest
        );
      }

      this.emit('approval:requested', approvalRequest);

      // Wait for approval with timeout
      return new Promise((resolve, reject) => {
        const pending = this.pendingApprovals.get(approvalId);

        pending.resolve = resolve;
        pending.reject = reject;

        // Set timeout
        pending.timeout = setTimeout(() => {
          this.pendingApprovals.delete(approvalId);

          logger.warn('Approval request timed out', {
            approvalId,
            operation
          });

          this.approvalHistory.push({
            ...approvalRequest,
            status: 'timeout',
            resolvedAt: Date.now()
          });

          this.emit('approval:timeout', approvalRequest);
          reject(new Error('Approval request timed out'));
        }, this.config.timeout);
      });
    } catch (error) {
      logger.error('Failed to request approval', {
        error: error.message,
        operation: request.operation
      });
      throw error;
    }
  }

  /**
   * Handle approval response from approver agent
   */
  handleApprovalResponse(response) {
    try {
      const { approvalId, approverId, approved, reason } = response;

      const pending = this.pendingApprovals.get(approvalId);
      if (!pending) {
        logger.warn('Approval response for unknown request', { approvalId });
        return;
      }

      // Verify approver is registered
      if (!this.approvers.has(approverId)) {
        logger.warn('Approval response from unregistered approver', {
          approvalId,
          approverId
        });
        return;
      }

      // Check if approver already responded
      const alreadyResponded =
        pending.approvals.some(a => a.approverId === approverId) ||
        pending.denials.some(d => d.approverId === approverId);

      if (alreadyResponded) {
        logger.warn('Duplicate approval response', { approvalId, approverId });
        return;
      }

      // Record response
      if (approved) {
        pending.approvals.push({
          approverId,
          approvedAt: Date.now(),
          reason
        });
        logger.info('Approval granted', { approvalId, approverId });
      } else {
        pending.denials.push({
          approverId,
          deniedAt: Date.now(),
          reason
        });
        logger.info('Approval denied', { approvalId, approverId, reason });
      }

      this.emit('approval:response', {
        approvalId,
        approverId,
        approved,
        reason
      });

      // Check if we have enough approvals or denials
      if (pending.denials.length > 0) {
        // Any denial rejects the approval
        this.resolveApproval(approvalId, false, 'denied');
      } else if (pending.approvals.length >= pending.requiredCount) {
        // Sufficient approvals
        this.resolveApproval(approvalId, true, 'approved');
      }
    } catch (error) {
      logger.error('Failed to handle approval response', {
        error: error.message,
        approvalId: response.approvalId
      });
    }
  }

  /**
   * Resolve approval request
   */
  resolveApproval(approvalId, approved, status) {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) return;

    // Clear timeout
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    // Update status
    pending.status = status;
    pending.resolvedAt = Date.now();

    // Add to history
    this.approvalHistory.push({ ...pending });

    // Limit history size
    if (this.approvalHistory.length > 1000) {
      this.approvalHistory = this.approvalHistory.slice(-1000);
    }

    logger.info('Approval resolved', {
      approvalId,
      approved,
      status,
      approvalsCount: pending.approvals.length,
      denialsCount: pending.denials.length
    });

    this.emit('approval:resolved', {
      approvalId,
      approved,
      status,
      request: pending
    });

    // Resolve promise
    if (pending.resolve) {
      pending.resolve(approved);
    }

    // Remove from pending
    this.pendingApprovals.delete(approvalId);
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals() {
    return Array.from(this.pendingApprovals.values()).map(approval => ({
      id: approval.id,
      operation: approval.operation,
      requestedBy: approval.requestedBy,
      requestedAt: approval.requestedAt,
      status: approval.status,
      approvalsCount: approval.approvals.length,
      denialsCount: approval.denials.length,
      requiredCount: approval.requiredCount
    }));
  }

  /**
   * Get approval history
   */
  getApprovalHistory(limit = 100) {
    return this.approvalHistory.slice(-limit).reverse();
  }

  /**
   * Cancel pending approval
   */
  cancelApproval(approvalId, reason = 'Cancelled by system') {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) return false;

    logger.info('Approval cancelled', { approvalId, reason });
    this.resolveApproval(approvalId, false, 'cancelled');

    return true;
  }

  /**
   * Get approval statistics
   */
  getStatistics() {
    const total = this.approvalHistory.length;
    const approved = this.approvalHistory.filter(a => a.status === 'approved').length;
    const denied = this.approvalHistory.filter(a => a.status === 'denied').length;
    const timeout = this.approvalHistory.filter(a => a.status === 'timeout').length;
    const cancelled = this.approvalHistory.filter(a => a.status === 'cancelled').length;

    return {
      total,
      approved,
      denied,
      timeout,
      cancelled,
      pending: this.pendingApprovals.size,
      approvers: this.approvers.size,
      approvalRate: total > 0 ? (approved / total * 100).toFixed(2) + '%' : '0%'
    };
  }
}

export default ApprovalWorkflow;
