/**
 * VikaOne Mutual Fund — Phase 4 Formal Order State Machine
 *
 * Enforces production-grade server-side transition validation.
 * Strictly prevents skipping intermediate stages (e.g. PAYMENT_PENDING -> ALLOTTED).
 * Records an immutable audit log for every transition.
 */

const MfOrder = require('../models/MfOrder');
const MfAuditLog = require('../models/MfAuditLog');

class InvalidStateTransitionError extends Error {
  constructor(currentStatus, targetStatus, reason) {
    super(`Invalid MF Order state transition from '${currentStatus}' to '${targetStatus}': ${reason}`);
    this.name = 'InvalidStateTransitionError';
    this.currentStatus = currentStatus;
    this.targetStatus = targetStatus;
  }
}

// Formal transition graph
const VALID_TRANSITIONS = {
  CREATED: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'CANCELLED'],
  PAYMENT_SUCCESS: ['SUBMISSION_PENDING', 'SUBMITTED', 'CANCELLED', 'REFUNDED'],
  SUBMISSION_PENDING: ['SUBMITTED', 'SUBMISSION_FAILED', 'REJECTED', 'CANCELLED'],
  SUBMITTED: ['PROCESSING', 'EXCHANGE_ACCEPTED', 'ALLOTTED', 'REJECTED', 'FAILED'],
  EXCHANGE_ACCEPTED: ['PROCESSING', 'ALLOTTED', 'PARTIALLY_ALLOTTED', 'REJECTED', 'FAILED'],
  PROCESSING: ['ALLOTTED', 'PARTIALLY_ALLOTTED', 'ALLOTMENT_FAILED', 'REJECTED', 'FAILED'],
  ALLOTTED: [], // Terminal under normal business lifecycle (reversals require admin adjustment workflow)
  PARTIALLY_ALLOTTED: ['ALLOTTED', 'REFUNDED'],
  PAYMENT_FAILED: ['PAYMENT_PENDING', 'CANCELLED'], // Allows re-attempting payment
  SUBMISSION_FAILED: ['SUBMISSION_PENDING', 'CANCELLED', 'REFUNDED'],
  EXCHANGE_REJECTED: ['REFUNDED', 'CANCELLED'],
  REJECTED: ['REFUNDED', 'CANCELLED'],
  ALLOTMENT_FAILED: ['REFUNDED', 'CANCELLED'],
  FAILED: ['REFUNDED', 'CANCELLED'],
  CANCELLED: [],
  REFUNDED: [],
};

class MfStateMachine {
  /**
   * Validate if a transition from currentStatus to targetStatus is legally permitted
   */
  canTransition(currentStatus, targetStatus) {
    if (!currentStatus || !targetStatus) return false;
    if (currentStatus === targetStatus) return true; // Idempotent same-state check
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    return allowed.includes(targetStatus);
  }

  /**
   * Assert transition validity or throw InvalidStateTransitionError
   */
  assertTransitionValid(currentStatus, targetStatus) {
    if (currentStatus === targetStatus) return; // Same state is valid/idempotent

    if (!VALID_TRANSITIONS[currentStatus]) {
      throw new InvalidStateTransitionError(
        currentStatus,
        targetStatus,
        `Current status '${currentStatus}' is not recognized in state machine.`
      );
    }

    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new InvalidStateTransitionError(
        currentStatus,
        targetStatus,
        `Allowed next states from '${currentStatus}' are [${(VALID_TRANSITIONS[currentStatus] || []).join(', ')}].`
      );
    }
  }

  /**
   * Safely execute an order state transition with validation, persistence, and audit logging
   * @param {string | object} orderOrId - MfOrder document or ID
   * @param {string} targetStatus - New order status
   * @param {object} metadata - { actor, source, externalReference, remark }
   */
  async transitionOrder(orderOrId, targetStatus, metadata = {}) {
    let order;
    if (typeof orderOrId === 'string' || orderOrId._bsontype === 'ObjectID') {
      order = await MfOrder.findById(orderOrId);
    } else {
      order = orderOrId;
    }

    if (!order) {
      throw new Error(`Order not found for transition to ${targetStatus}`);
    }

    const previousStatus = order.orderStatus || 'CREATED';

    // 1. Same state check (idempotent)
    if (previousStatus === targetStatus) {
      return {
        order,
        previousStatus,
        newStatus: targetStatus,
        transitioned: false,
        isIdempotent: true,
      };
    }

    // 2. Validate transition
    this.assertTransitionValid(previousStatus, targetStatus);

    // 3. Mutate order status
    order.orderStatus = targetStatus;

    if (metadata.externalReference) {
      order.nseTrxnOrderId = metadata.externalReference;
    }
    if (metadata.remark) {
      order.remarks = `${order.remarks ? order.remarks + ' | ' : ''}${metadata.remark}`;
    }

    await order.save();

    // 4. Create immutable audit log entry
    await MfAuditLog.create({
      event: `ORDER_STATE_TRANSITION_${targetStatus}`,
      entityType: 'ORDER',
      entityId: String(order._id),
      user: order.user,
      previousState: { orderStatus: previousStatus },
      newState: { orderStatus: targetStatus },
      source: metadata.source || 'STATE_MACHINE',
      externalReference: metadata.externalReference || order.orderId,
      actor: metadata.actor || 'SYSTEM',
      reason: metadata.remark || `State changed from ${previousStatus} to ${targetStatus}`,
    });

    return {
      order,
      previousStatus,
      newStatus: targetStatus,
      transitioned: true,
      isIdempotent: false,
    };
  }
}

module.exports = {
  MfStateMachine: new MfStateMachine(),
  InvalidStateTransitionError,
  VALID_TRANSITIONS,
};
