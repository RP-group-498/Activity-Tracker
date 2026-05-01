/**
 * Native Messaging Service
 * Handles communication with the Focus App desktop application via Chrome Native Messaging API.
 *
 * The desktop app provides session management and receives activity data for classification.
 */

import {
  ActivityEvent,
  SessionMessage,
  AckMessage,
  CommandMessage,
  DesktopMessage,
  ExtensionMessage,
} from '../types';

const HOST_NAME = 'com.focusapp.monitor';

export type ConnectionChangeCallback = (isConnected: boolean) => void;
export type SessionUpdateCallback = (session: SessionMessage) => void;
export type ErrorCallback = (error: string | null) => void;
export type CommandCallback = (command: 'pause' | 'resume' | 'clear_local') => void;
export type AckCallback = (eventIds: string[]) => void;

interface ConnectionStatus {
  isConnected: boolean;
  pendingMessages: number;
  pendingAcks: number;
}

/**
 * Native Messaging Service - Singleton
 */
class NativeMessagingService {
  private port: chrome.runtime.Port | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectDelay: number = 2000; // ms base delay
  private maxReconnectDelay: number = 60000; // ms max delay (60s)
  private messageQueue: ExtensionMessage[] = [];
  private pendingAcks: Map<string, ActivityEvent> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Callbacks
  private onSessionUpdate: SessionUpdateCallback | null = null;
  private onConnectionChange: ConnectionChangeCallback | null = null;
  private onError: ErrorCallback | null = null;
  private onCommand: CommandCallback | null = null;
  private onAck: AckCallback | null = null;

  /**
   * Set callback for session updates from desktop app
   */
  setSessionUpdateCallback(callback: SessionUpdateCallback): void {
    this.onSessionUpdate = callback;
  }

  /**
   * Set callback for connection state changes
   */
  setConnectionChangeCallback(callback: ConnectionChangeCallback): void {
    this.onConnectionChange = callback;
  }

  /**
   * Set error callback
   */
  setErrorCallback(callback: ErrorCallback): void {
    this.onError = callback;
  }

  /**
   * Set callback for commands from desktop app
   */
  setCommandCallback(callback: CommandCallback): void {
    this.onCommand = callback;
  }

  /**
   * Set callback for ACK messages (to mark events as synced)
   */
  setAckCallback(callback: AckCallback): void {
    this.onAck = callback;
  }

  /**
   * Initialize connection to desktop app
   */
  connect(): void {
    if (this.isConnected) {
      console.log('[NativeMsg] Already connected');
      return;
    }

    // If there's a stale port from a previous attempt, clean it up
    if (this.port) {
      try {
        this.port.disconnect();
      } catch (_) {
        // ignore
      }
      this.port = null;
    }

    try {
      this.port = chrome.runtime.connectNative(HOST_NAME);

      this.port.onMessage.addListener((message: DesktopMessage) => {
        this.handleMessage(message);
      });

      this.port.onDisconnect.addListener(() => {
        this.handleDisconnect();
      });

      // Send initial connection message directly (bypass isConnected check)
      const connectMessage = {
        type: 'connect',
        extensionId: chrome.runtime.id,
        extensionVersion: chrome.runtime.getManifest().version,
        timestamp: new Date().toISOString(),
      };
      try {
        this.port.postMessage(connectMessage);
        console.log('[NativeMsg] Connect message sent');
      } catch (error) {
        console.error('[NativeMsg] Failed to send connect message:', error);
      }

      console.log('[NativeMsg] Connection initiated');
    } catch (error) {
      console.error('[NativeMsg] Connection failed:', error);
      this.handleDisconnect();
    }
  }

  /**
   * Handle incoming messages from desktop app
   */
  private handleMessage(message: DesktopMessage): void {
    console.log('[NativeMsg] Received:', message.type);

    switch (message.type) {
      case 'session':
        this.isConnected = true;
        this.reconnectAttempts = 0;
        if (this.onSessionUpdate) {
          this.onSessionUpdate(message as SessionMessage);
        }
        if (this.onConnectionChange) {
          this.onConnectionChange(true);
        }
        if (this.onError) {
          this.onError(null);
        }
        // Flush queued messages
        this.flushQueue();
        break;

      case 'ack':
        // Mark events as synced
        const ackMessage = message as AckMessage;
        if (ackMessage.receivedEventIds && ackMessage.receivedEventIds.length > 0) {
          // Remove from pending acks map
          ackMessage.receivedEventIds.forEach((id) => {
            this.pendingAcks.delete(id);
          });
          // Notify callback to mark events as synced in storage
          if (this.onAck) {
            this.onAck(ackMessage.receivedEventIds);
          }
          console.log(`[NativeMsg] ACK received for ${ackMessage.receivedEventIds.length} events`);
        }
        // Clear any connection errors since we successfully received an ACK
        if (this.onError) {
          this.onError(null);
        }
        break;

      case 'command':
        const cmdMessage = message as CommandMessage;
        if (this.onCommand) {
          this.onCommand(cmdMessage.command);
        }
        break;

      case 'error':
        console.error('[NativeMsg] Desktop app error:', message.error);
        if (this.onError) {
          this.onError(message.error);
        }
        break;

      default:
        console.warn('[NativeMsg] Unknown message type:', (message as DesktopMessage).type);
    }
  }

  /**
   * Handle disconnect from desktop app
   */
  private handleDisconnect(): void {
    const error = chrome.runtime.lastError;
    console.log('[NativeMsg] Disconnected:', error?.message || 'Unknown reason');

    this.port = null;
    const wasConnected = this.isConnected;
    this.isConnected = false;

    if (this.onConnectionChange) {
      this.onConnectionChange(false);
    }

    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Always attempt reconnect with exponential backoff (never give up)
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    console.log(
      `[NativeMsg] Reconnect attempt ${this.reconnectAttempts} in ${delay}ms`
    );

    // Notify about disconnection only if we were previously connected
    if (wasConnected && this.onError) {
      this.onError('Desktop app disconnected. Reconnecting...');
    }

    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  /**
   * Send message to desktop app
   */
  private send(message: ExtensionMessage): boolean {
    if (this.port && this.isConnected) {
      try {
        this.port.postMessage(message);
        return true;
      } catch (error) {
        console.error('[NativeMsg] Send failed:', error);
        this.messageQueue.push(message);
        return false;
      }
    } else {
      // Queue message for later
      this.messageQueue.push(message);
      return false;
    }
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  /**
   * Send activity events to desktop app
   */
  sendActivityBatch(events: ActivityEvent[]): boolean {
    if (!events || events.length === 0) return true;

    const message: ExtensionMessage = {
      type: 'activity_batch',
      events: events,
      extensionVersion: chrome.runtime.getManifest().version,
      timestamp: new Date().toISOString(),
    };

    // Track pending acknowledgments
    events.forEach((event) => {
      this.pendingAcks.set(event.eventId, event);
    });

    return this.send(message);
  }

  /**
   * Send heartbeat to desktop app
   */
  sendHeartbeat(pendingCount: number): boolean {
    return this.send({
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
      pendingEvents: pendingCount,
    });
  }

  /**
   * Check if connected to desktop app
   */
  getConnectionStatus(): ConnectionStatus {
    return {
      isConnected: this.isConnected,
      pendingMessages: this.messageQueue.length,
      pendingAcks: this.pendingAcks.size,
    };
  }

  /**
   * Check if connected
   */
  isDesktopConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get pending ack event IDs
   */
  getPendingAckIds(): string[] {
    return Array.from(this.pendingAcks.keys());
  }

  /**
   * Disconnect from desktop app
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this.isConnected = false;
  }

  /**
   * Reset reconnect attempts (call after successful operations)
   */
  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }
}

// Singleton instance
let serviceInstance: NativeMessagingService | null = null;

/**
 * Get the singleton native messaging service instance
 */
export function getNativeMessagingService(): NativeMessagingService {
  if (!serviceInstance) {
    serviceInstance = new NativeMessagingService();
  }
  return serviceInstance;
}
