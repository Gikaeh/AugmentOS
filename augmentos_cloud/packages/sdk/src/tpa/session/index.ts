/**
 * 🎯 TPA Session Module
 * 
 * Manages an active Third Party App session with AugmentOS Cloud.
 * Handles real-time communication, event subscriptions, and display management.
 */
import WebSocket from 'ws';
import { EventManager, EventData, StreamDataTypes } from './events';
import { LayoutManager } from './layouts';
import { SettingsManager } from './settings';
import { ResourceTracker } from '../../utils/resource-tracker';
import { MediaControls } from './media';
import {
  // Message types
  TpaToCloudMessage,
  CloudToTpaMessage,
  TpaConnectionInit,
  TpaSubscriptionUpdate,
  PhotoRequest,
  TpaToCloudMessageType,
  CloudToTpaMessageType,

  // Event data types
  StreamType,
  ExtendedStreamType,
  ButtonPress,
  HeadPosition,
  PhoneNotification,
  TranscriptionData,
  TranslationData,
  MediaControlCommand,

  // Type guards
  isTpaConnectionAck,
  isTpaConnectionError,
  isDataStream,
  isAppStopped,
  isSettingsUpdate,
  isPhotoResponse,
  isDashboardModeChanged,
  isDashboardAlwaysOnChanged,
  isMediaStateUpdate,
  isMediaMetadataUpdate,
  isMediaSessionEndedUpdate,

  // Other types
  AppSettings,
  AppSetting,
  TpaConfig,
  validateTpaConfig,
  AudioChunk,
  isAudioChunk,
  createTranscriptionStream,
  createTranslationStream
} from '../../types';
import { DashboardAPI } from '../../types/dashboard';
import { AugmentosSettingsUpdate } from '../../types/messages/cloud-to-tpa';
import { Logger } from 'pino';
import { TpaServer } from '../server';

/**
 * ⚙️ Configuration options for TPA Session
 * 
 * @example
 * ```typescript
 * const config: TpaSessionConfig = {
 *   packageName: 'org.example.myapp',
 *   apiKey: 'your_api_key',
 *   // Auto-reconnection is enabled by default
 *   // autoReconnect: true 
 * };
 * ```
 */
export interface TpaSessionConfig {
  /** 📦 Unique identifier for your TPA (e.g., 'org.company.appname') */
  packageName: string;
  /** 🔑 API key for authentication with AugmentOS Cloud */
  apiKey: string;
  /** 🔌 WebSocket server URL (default: 'ws://localhost:7002/tpa-ws') */
  augmentOSWebsocketUrl?: string;
  /** 🔄 Automatically attempt to reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** 🔁 Maximum number of reconnection attempts (default: 3) */
  maxReconnectAttempts?: number;
  /** ⏱️ Base delay between reconnection attempts in ms (default: 1000) */
  reconnectDelay?: number;

  userId: string; // user ID for tracking sessions (email of the user).
  tpaServer: TpaServer; // Optional TPA server instance for advanced features
}

/**
 * 🚀 TPA Session Implementation
 * 
 * Manages a live connection between your TPA and AugmentOS Cloud.
 * Provides interfaces for:
 * - 🎮 Event handling (transcription, head position, etc.)
 * - 📱 Display management in AR view
 * - 🔌 Connection lifecycle
 * - 🔄 Automatic reconnection
 * 
 * @example
 * ```typescript
 * const session = new TpaSession({
 *   packageName: 'org.example.myapp',
 *   apiKey: 'your_api_key'
 * });
 * 
 * // Handle events
 * session.onTranscription((data) => {
 *   session.layouts.showTextWall(data.text);
 * });
 * 
 * // Connect to cloud
 * await session.connect('session_123');
 * ```
 */
export class TpaSession {
  /** WebSocket connection to AugmentOS Cloud */
  private ws: WebSocket | null = null;
  /** Current session identifier */
  private sessionId: string | null = null;
  /** Number of reconnection attempts made */
  private reconnectAttempts = 0;
  /** Active event subscriptions */
  private subscriptions = new Set<ExtendedStreamType>();
  /** Resource tracker for automatic cleanup */
  private resources = new ResourceTracker();
  /** Internal settings storage - use public settings API instead */
  private settingsData: AppSettings = [];
  /** TPA configuration loaded from tpa_config.json */
  private tpaConfig: TpaConfig | null = null;
  /** Whether to update subscriptions when settings change */
  private shouldUpdateSubscriptionsOnSettingsChange = false;
  /** Custom subscription handler for settings-based subscriptions */
  private subscriptionSettingsHandler?: (settings: AppSettings) => ExtendedStreamType[];
  /** Settings that should trigger subscription updates when changed */
  private subscriptionUpdateTriggers: string[] = [];
  /** Pending photo requests waiting for responses */
  private pendingPhotoRequests = new Map<string, {
    resolve: (url: string) => void,
    reject: (reason: any) => void
  }>();

  /** 🎮 Event management interface */
  public readonly events: EventManager;
  /** 📱 Layout management interface */
  public readonly layouts: LayoutManager;
  /** ⚙️ Settings management interface */
  public readonly settings: SettingsManager;
  /** 📊 Dashboard management interface */
  public readonly dashboard: DashboardAPI;

  public readonly tpaServer: TpaServer;
  public readonly logger: Logger;
  public readonly userId: string;
  /** Media management interface */
  public readonly media: MediaControls;

  constructor(private config: TpaSessionConfig) {
    // Set defaults and merge with provided config
    this.config = {
      augmentOSWebsocketUrl: `ws://localhost:8002/tpa-ws`, // Use localhost as default
      autoReconnect: true,   // Enable auto-reconnection by default for better reliability
      maxReconnectAttempts: 3, // Default to 3 reconnection attempts for better resilience
      reconnectDelay: 1000,  // Start with 1 second delay (uses exponential backoff)
      ...config
    };

    this.tpaServer = this.config.tpaServer;
    this.logger = this.tpaServer.logger.child({ userId: this.config.userId, service: 'tpa-session' });
    this.userId = this.config.userId;

    // Make sure the URL is correctly formatted to prevent double protocol issues
    if (this.config.augmentOSWebsocketUrl) {
      try {
        const url = new URL(this.config.augmentOSWebsocketUrl);
        if (!['ws:', 'wss:'].includes(url.protocol)) {
          // Fix URLs with incorrect protocol (e.g., 'ws://http://host')
          const fixedUrl = this.config.augmentOSWebsocketUrl.replace(/^ws:\/\/http:\/\//, 'ws://');
          this.config.augmentOSWebsocketUrl = fixedUrl;
          this.logger.warn(`⚠️ [${this.config.packageName}] Fixed malformed WebSocket URL: ${fixedUrl}`);
        }
      } catch (error) {
        this.logger.error({ error, config: this.config }, `⚠️ [${this.config.packageName}] Invalid WebSocket URL format: ${this.config.augmentOSWebsocketUrl}`);
      }
    }

    // Log initialization
    this.logger.debug(`🚀 [${this.config.packageName}] TPA Session initialized`);
    this.logger.debug(`🚀 [${this.config.packageName}] WebSocket URL: ${this.config.augmentOSWebsocketUrl}`);

    // Validate URL format - give early warning for obvious issues
    // Check URL format but handle undefined case
    if (this.config.augmentOSWebsocketUrl) {
      try {
        const url = new URL(this.config.augmentOSWebsocketUrl);
        if (!['ws:', 'wss:'].includes(url.protocol)) {
          this.logger.error({ config: this.config }, `⚠️ [${this.config.packageName}] Invalid WebSocket URL protocol: ${url.protocol}. Should be ws: or wss:`);
        }
      } catch (error) {
        this.logger.error({ error, config: this.config }, `⚠️ [${this.config.packageName}] Invalid WebSocket URL format: ${this.config.augmentOSWebsocketUrl}`);
      }
    }

    this.events = new EventManager(this.subscribe.bind(this), this.unsubscribe.bind(this));
    this.layouts = new LayoutManager(
      config.packageName,
      this.send.bind(this)
    );

    // Initialize settings manager with all necessary parameters, including subscribeFn for AugmentOS settings
    this.settings = new SettingsManager(
      this.settingsData,
      this.config.packageName,
      this.config.augmentOSWebsocketUrl,
      this.sessionId ?? undefined,
      async (streams: string[]) => {
        this.logger.debug(`[TpaSession] subscribeFn called for streams:`, streams);
        streams.forEach((stream) => {
          if (!this.subscriptions.has(stream as ExtendedStreamType)) {
            this.subscriptions.add(stream as ExtendedStreamType);
            this.logger.debug(`[TpaSession] Auto-subscribed to stream '${stream}' for AugmentOS setting.`);
          } else {
            this.logger.debug(`[TpaSession] Already subscribed to stream '${stream}'.`);
          }
        });
        this.logger.debug(`[TpaSession] Current subscriptions after subscribeFn:`, Array.from(this.subscriptions));
        if (this.ws?.readyState === 1) {
          this.updateSubscriptions();
          this.logger.debug(`[TpaSession] Sent updated subscriptions to cloud after auto-subscribing to AugmentOS setting.`);
        } else {
          this.logger.debug(`[TpaSession] WebSocket not open, will send subscriptions when connected.`);
        }
      }
    );

    // Initialize dashboard API with this session instance
    // Import DashboardManager dynamically to avoid circular dependency
    const { DashboardManager } = require('./dashboard');
    this.dashboard = new DashboardManager(this, this.send.bind(this));

    // Initialize media controls
    this.media = new MediaControls(this.events, (command: MediaControlCommand) => {
      this.send(command);
    });
  }

  /**
   * Get the current session ID
   * @returns The current session ID or 'unknown-session-id' if not connected
   */
  getSessionId(): string {
    return this.sessionId || 'unknown-session-id';
  }

  /**
   * Get the package name for this TPA
   * @returns The package name
   */
  getPackageName(): string {
    return this.config.packageName;
  }

  // =====================================
  // 🎮 Direct Event Handling Interface
  // =====================================

  /**
   * 🎤 Listen for speech transcription events
   * @param handler - Function to handle transcription data
   * @returns Cleanup function to remove the handler
   */
  onTranscription(handler: (data: TranscriptionData) => void): () => void {
    return this.events.onTranscription(handler);
  }

  /**
   * 🌐 Listen for speech transcription events in a specific language
   * @param language - Language code (e.g., "en-US")
   * @param handler - Function to handle transcription data
   * @returns Cleanup function to remove the handler
   * @throws Error if language code is invalid
   */
  onTranscriptionForLanguage(language: string, handler: (data: TranscriptionData) => void): () => void {
    return this.events.onTranscriptionForLanguage(language, handler);
  }

  /**
   * 🌐 Listen for speech translation events for a specific language pair
   * @param sourceLanguage - Source language code (e.g., "es-ES")
   * @param targetLanguage - Target language code (e.g., "en-US")
   * @param handler - Function to handle translation data
   * @returns Cleanup function to remove the handler
   * @throws Error if language codes are invalid
   */
  onTranslationForLanguage(sourceLanguage: string, targetLanguage: string, handler: (data: TranslationData) => void): () => void {
    return this.events.ontranslationForLanguage(sourceLanguage, targetLanguage, handler);
  }

  /**
   * 👤 Listen for head position changes
   * @param handler - Function to handle head position updates
   * @returns Cleanup function to remove the handler
   */
  onHeadPosition(handler: (data: HeadPosition) => void): () => void {
    return this.events.onHeadPosition(handler);
  }

  /**
   * 🔘 Listen for hardware button press events
   * @param handler - Function to handle button events
   * @returns Cleanup function to remove the handler
   */
  onButtonPress(handler: (data: ButtonPress) => void): () => void {
    return this.events.onButtonPress(handler);
  }

  /**
   * 📱 Listen for phone notification events
   * @param handler - Function to handle notifications
   * @returns Cleanup function to remove the handler
   */
  onPhoneNotifications(handler: (data: PhoneNotification) => void): () => void {
    return this.events.onPhoneNotifications(handler);
  }

  // =====================================
  // 📡 Pub/Sub Interface
  // =====================================

  /**
   * 📬 Subscribe to a specific event stream
   * @param type - Type of event to subscribe to
   */
  subscribe(type: ExtendedStreamType): void {
    this.subscriptions.add(type);
    if (this.ws?.readyState === 1) {
      this.updateSubscriptions();
    }
  }

  /**
   * 📭 Unsubscribe from a specific event stream
   * @param type - Type of event to unsubscribe from
   */
  unsubscribe(type: ExtendedStreamType): void {
    this.subscriptions.delete(type);
    if (this.ws?.readyState === 1) {
      this.updateSubscriptions();
    }
  }

  /**
   * 🎯 Generic event listener (pub/sub style)
   * @param event - Event name to listen for
   * @param handler - Event handler function
   */
  on<T extends ExtendedStreamType>(event: T, handler: (data: EventData<T>) => void): () => void {
    return this.events.on(event, handler);
  }

  // =====================================
  // 🔌 Connection Management
  // =====================================

  /**
   * 🚀 Connect to AugmentOS Cloud
   * @param sessionId - Unique session identifier
   * @returns Promise that resolves when connected
   */
  async connect(sessionId: string): Promise<void> {
    this.sessionId = sessionId;

    // Configure settings API client with the WebSocket URL and session ID
    // This allows settings to be fetched from the correct server
    this.settings.configureApiClient(
      this.config.packageName,
      this.config.augmentOSWebsocketUrl || '',
      sessionId
    );

    return new Promise((resolve, reject) => {
      try {
        // Clear previous resources if reconnecting
        if (this.ws) {
          // Don't call full dispose() as that would clear subscriptions
          if (this.ws.readyState !== 3) { // 3 = CLOSED
            this.ws.close();
          }
          this.ws = null;
        }

        // Validate WebSocket URL before attempting connection
        if (!this.config.augmentOSWebsocketUrl) {
          this.logger.error('WebSocket URL is missing or undefined');
          reject(new Error('WebSocket URL is required'));
          return;
        }

        // Add debug logging for connection attempts
        this.logger.info(`🔌🔌🔌 [${this.config.packageName}] Attempting to connect to: ${this.config.augmentOSWebsocketUrl} for session ${this.sessionId}`);

        // Create connection with error handling
        this.ws = new WebSocket(this.config.augmentOSWebsocketUrl);

        // Track WebSocket for automatic cleanup
        this.resources.track(() => {
          if (this.ws && this.ws.readyState !== 3) { // 3 = CLOSED
            this.ws.close();
          }
        });

        this.ws.on('open', () => {
          try {
            this.sendConnectionInit();
          } catch (error: unknown) {
            this.logger.error({ error }, 'Error during connection initialization');
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.events.emit('error', new Error(`Connection initialization failed: ${errorMessage}`));
            reject(error);
          }
        });

        // Message handler with comprehensive error recovery
        const messageHandler = async (data: Buffer | string, isBinary: boolean) => {
          try {
            // Handle binary messages (typically audio data)
            if (isBinary && Buffer.isBuffer(data)) {
              try {
                // Validate buffer before processing
                if (data.length === 0) {
                  this.events.emit('error', new Error('Received empty binary data'));
                  return;
                }

                // Convert Node.js Buffer to ArrayBuffer safely
                const arrayBuf: ArrayBufferLike = data.buffer.slice(
                  data.byteOffset,
                  data.byteOffset + data.byteLength
                );

                // Create AUDIO_CHUNK event message with validation
                const audioChunk: AudioChunk = {
                  type: StreamType.AUDIO_CHUNK,
                  arrayBuffer: arrayBuf,
                  timestamp: new Date() // Ensure timestamp is present
                };

                this.handleMessage(audioChunk);
                return;
              } catch (error: unknown) {
                this.logger.error({ error }, 'Error processing binary message:');
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.events.emit('error', new Error(`Failed to process binary message: ${errorMessage}`));
                return;
              }
            }

            // Handle ArrayBuffer data type directly
            if (data instanceof ArrayBuffer) {
              return;
            }

            // Handle JSON messages with validation
            try {
              // Convert string data to JSON safely
              let jsonData: string;
              if (typeof data === 'string') {
                jsonData = data;
              } else if (Buffer.isBuffer(data)) {
                jsonData = data.toString('utf8');
              } else {
                throw new Error('Unknown message format');
              }

              // Validate JSON before parsing
              if (!jsonData || jsonData.trim() === '') {
                this.events.emit('error', new Error('Received empty JSON message'));
                return;
              }

              // Parse JSON with error handling
              const message = JSON.parse(jsonData) as CloudToTpaMessage;

              // Basic schema validation
              if (!message || typeof message !== 'object' || !('type' in message)) {
                this.events.emit('error', new Error('Malformed message: missing type property'));
                return;
              }

              // Process the validated message
              this.handleMessage(message);
            } catch (error: unknown) {
              this.logger.error({ error }, 'JSON parsing error');
              const errorMessage = error instanceof Error ? error.message : String(error);
              this.events.emit('error', new Error(`Failed to parse JSON message: ${errorMessage}`));
            }
          } catch (error: unknown) {
            // Final catch - should never reach here if individual handlers work correctly
            this.logger.error({ error }, 'Unhandled message processing error');
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.events.emit('error', new Error(`Unhandled message error: ${errorMessage}`));
          }
        };

        this.ws.on('message', messageHandler);

        // Track event handler removal for automatic cleanup
        this.resources.track(() => {
          if (this.ws) {
            this.ws.off('message', messageHandler);
          }
        });

        // Connection closure handler
        const closeHandler = (code: number, reason: string) => {
          const reasonStr = reason ? `: ${reason}` : '';
          const closeInfo = `Connection closed (code: ${code})${reasonStr}`;

          // Emit the disconnected event with structured data for better handling
          this.events.emit('disconnected', {
            message: closeInfo,
            code: code,
            reason: reason || '',
            wasClean: code === 1000 || code === 1001,
          });

          // Only attempt reconnection for abnormal closures
          // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
          // 1000 (Normal Closure) and 1001 (Going Away) are normal
          // 1002-1015 are abnormal, and reason "App stopped" means intentional closure
          // 1008 usually when the userSession no longer exists on server. i.e user disconnected from cloud.
          const isNormalClosure = (code === 1000 || code === 1001 || code === 1008);
          const isManualStop = reason && reason.includes('App stopped');

          // Log closure details for diagnostics
          this.logger.debug(`🔌 [${this.config.packageName}] WebSocket closed with code ${code}${reasonStr}`);
          this.logger.debug(`🔌 [${this.config.packageName}] isNormalClosure: ${isNormalClosure}, isManualStop: ${isManualStop}`);

          if (!isNormalClosure && !isManualStop) {
            this.logger.warn(`🔌 [${this.config.packageName}] Abnormal closure detected, attempting reconnection`);
            this.handleReconnection();
          } else {
            this.logger.debug(`🔌 [${this.config.packageName}] Normal closure detected, not attempting reconnection`);
          }
        };

        this.ws.on('close', closeHandler);

        // Track event handler removal
        this.resources.track(() => {
          if (this.ws) {
            this.ws.off('close', closeHandler);
          }
        });

        // Connection error handler
        const errorHandler = (error: Error) => {
          this.logger.error({ error }, 'WebSocket error');
          this.events.emit('error', error);
        };

        // Enhanced error handler with detailed logging
        this.ws.on('error', (error: Error) => {
          this.logger.error({ error, config: this.config }, `⛔️⛔️⛔️ [${this.config.packageName}] WebSocket connection error: ${error.message}`);

          // Try to provide more context
          const errMsg = error.message || '';
          if (errMsg.includes('ECONNREFUSED')) {
            this.logger.error(`⛔️⛔️⛔️ [${this.config.packageName}] Connection refused - Check if the server is running at the specified URL`);
          } else if (errMsg.includes('ETIMEDOUT')) {
            this.logger.error(`⛔️⛔️⛔️ [${this.config.packageName}] Connection timed out - Check network connectivity and firewall rules`);
          }

          errorHandler(error);
        });

        // Track event handler removal
        this.resources.track(() => {
          if (this.ws) {
            this.ws.off('error', errorHandler);
          }
        });

        // Set up connection success handler
        const connectedCleanup = this.events.onConnected(() => resolve());

        // Track event handler removal
        this.resources.track(connectedCleanup);

        // Connection timeout with configurable duration
        const timeoutMs = 5000; // 5 seconds default
        const connectionTimeout = this.resources.setTimeout(() => {
          // Use tracked timeout that will be auto-cleared
          this.logger.error({
            config: this.config,
            sessionId: this.sessionId,
            timeoutMs
          }, `⏱️⏱️⏱️ [${this.config.packageName}] Connection timeout after ${timeoutMs}ms`);

          this.events.emit('error', new Error(`Connection timeout after ${timeoutMs}ms`));
          reject(new Error('Connection timeout'));
        }, timeoutMs);

        // Clear timeout on successful connection
        const timeoutCleanup = this.events.onConnected(() => {
          clearTimeout(connectionTimeout);
          resolve();
        });

        // Track event handler removal
        this.resources.track(timeoutCleanup);

      } catch (error: unknown) {
        this.logger.error({ error }, 'Connection setup error');
        const errorMessage = error instanceof Error ? error.message : String(error);
        reject(new Error(`Failed to setup connection: ${errorMessage}`));
      }
    });
  }

  /**
   * 👋 Disconnect from AugmentOS Cloud
   */
  disconnect(): void {
    // Use the resource tracker to clean up everything
    this.resources.dispose();

    // Clean up additional resources not handled by the tracker
    this.ws = null;
    this.sessionId = null;
    this.subscriptions.clear();
    this.reconnectAttempts = 0;
  }

  /**
   * 📸 Request a photo from the connected glasses
   * @param options - Optional configuration for the photo request
   * @returns Promise that resolves with the URL to the captured photo
   */
  requestPhoto(options?: { saveToGallery?: boolean }): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Generate unique request ID
        const requestId = `photo_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Store promise resolvers for when we get the response
        this.pendingPhotoRequests.set(requestId, { resolve, reject });

        // Create photo request message
        const message: PhotoRequest = {
          type: TpaToCloudMessageType.PHOTO_REQUEST,
          packageName: this.config.packageName,
          sessionId: this.sessionId!,
          timestamp: new Date(),
          saveToGallery: options?.saveToGallery || false
        };

        // Send request to cloud
        this.send(message);

        // Set timeout to avoid hanging promises
        const timeoutMs = 30000; // 30 seconds
        this.resources.setTimeout(() => {
          if (this.pendingPhotoRequests.has(requestId)) {
            this.pendingPhotoRequests.get(requestId)!.reject(new Error('Photo request timed out'));
            this.pendingPhotoRequests.delete(requestId);
          }
        }, timeoutMs);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        reject(new Error(`Failed to request photo: ${errorMessage}`));
      }
    });
  }

  /**
   * 🛠️ Get all current user settings
   * @returns A copy of the current settings array
   * @deprecated Use session.settings.getAll() instead
   */
  getSettings(): AppSettings {
    return this.settings.getAll();
  }

  /**
   * 🔍 Get a specific setting value by key
   * @param key The setting key to look for
   * @returns The setting's value, or undefined if not found
   * @deprecated Use session.settings.get(key) instead
   */
  getSetting<T>(key: string): T | undefined {
    return this.settings.get<T>(key);
  }

  /**
   * ⚙️ Configure settings-based subscription updates
   * This allows TPAs to automatically update their subscriptions when certain settings change
   * @param options Configuration options for settings-based subscriptions
   */
  setSubscriptionSettings(options: {
    updateOnChange: string[]; // Setting keys that should trigger subscription updates
    handler: (settings: AppSettings) => ExtendedStreamType[]; // Handler that returns new subscriptions
  }): void {
    this.shouldUpdateSubscriptionsOnSettingsChange = true;
    this.subscriptionUpdateTriggers = options.updateOnChange;
    this.subscriptionSettingsHandler = options.handler;

    // If we already have settings, update subscriptions immediately
    if (this.settingsData.length > 0) {
      this.updateSubscriptionsFromSettings();
    }
  }

  /**
   * 🔄 Update subscriptions based on current settings
   * Called automatically when relevant settings change
   */
  private updateSubscriptionsFromSettings(): void {
    if (!this.subscriptionSettingsHandler) return;

    try {
      // Get new subscriptions from handler
      const newSubscriptions = this.subscriptionSettingsHandler(this.settingsData);

      // Update all subscriptions at once
      this.subscriptions.clear();
      newSubscriptions.forEach(subscription => {
        this.subscriptions.add(subscription);
      });

      // Send subscription update to cloud if connected
      if (this.ws && this.ws.readyState === 1) {
        this.updateSubscriptions();
      }
    } catch (error: unknown) {
      this.logger.error({ error }, 'Error updating subscriptions from settings');
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.events.emit('error', new Error(`Failed to update subscriptions: ${errorMessage}`));
    }
  }

  /**
   * 🧪 For testing: Update settings locally
   * In normal operation, settings come from the cloud
   * @param newSettings The new settings to apply
   */
  updateSettingsForTesting(newSettings: AppSettings): void {
    this.settingsData = newSettings;

    // Update the settings manager with the new settings
    this.settings.updateSettings(newSettings);

    // Emit update event for backwards compatibility
    this.events.emit('settings_update', this.settingsData);

    // Check if we should update subscriptions
    if (this.shouldUpdateSubscriptionsOnSettingsChange) {
      this.updateSubscriptionsFromSettings();
    }
  }

  /**
   * 📝 Load configuration from a JSON file
   * @param jsonData JSON string containing TPA configuration
   * @returns The loaded configuration
   * @throws Error if the configuration is invalid
   */
  loadConfigFromJson(jsonData: string): TpaConfig {
    try {
      const parsedConfig = JSON.parse(jsonData);

      if (validateTpaConfig(parsedConfig)) {
        this.tpaConfig = parsedConfig;
        return parsedConfig;
      } else {
        throw new Error('Invalid TPA configuration format');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load TPA configuration: ${errorMessage}`);
    }
  }

  /**
   * 📋 Get the loaded TPA configuration
   * @returns The current TPA configuration or null if not loaded
   */
  getConfig(): TpaConfig | null {
    return this.tpaConfig;
  }

  /**
   * 🔌 Get the WebSocket server URL for this session
   * @returns The WebSocket server URL used by this session
   */
  getServerUrl(): string | undefined {
    return this.config.augmentOSWebsocketUrl;
  }

  /**
   * 🔍 Get default settings from the TPA configuration
   * @returns Array of settings with default values
   * @throws Error if configuration is not loaded
   */
  getDefaultSettings(): AppSettings {
    if (!this.tpaConfig) {
      throw new Error('TPA configuration not loaded. Call loadConfigFromJson first.');
    }

    return this.tpaConfig.settings
      .filter((s: AppSetting | { type: 'group'; title: string }): s is AppSetting => s.type !== 'group')
      .map((s: AppSetting) => ({
        ...s,
        value: s.defaultValue  // Set value to defaultValue
      }));
  }

  /**
   * 🔍 Get setting schema from configuration
   * @param key Setting key to look up
   * @returns The setting schema or undefined if not found
   */
  getSettingSchema(key: string): AppSetting | undefined {
    if (!this.tpaConfig) return undefined;

    const setting = this.tpaConfig.settings.find((s: AppSetting | { type: 'group'; title: string }) =>
      s.type !== 'group' && 'key' in s && s.key === key
    );

    return setting as AppSetting | undefined;
  }

  // =====================================
  // 🔧 Private Methods
  // =====================================

  /**
   * 📨 Handle incoming messages from cloud
   */
  private handleMessage(message: CloudToTpaMessage): void {
    try {
      // Validate message before processing
      if (!this.validateMessage(message)) {
        this.events.emit('error', new Error('Invalid message format received'));
        return;
      }

      // Handle binary data (audio or video)
      if (message instanceof ArrayBuffer) {
        this.handleBinaryMessage(message);
        return;
      }

      // Using type guards to determine message type and safely handle each case
      try {
        if (isTpaConnectionAck(message)) {
          // Get settings from connection acknowledgment
          const receivedSettings = message.settings || [];
          this.settingsData = receivedSettings;

          // Store config if provided
          if (message.config && validateTpaConfig(message.config)) {
            this.tpaConfig = message.config;
          }

          // Use default settings from config if no settings were provided
          if (receivedSettings.length === 0 && this.tpaConfig) {
            try {
              this.settingsData = this.getDefaultSettings();
            } catch (error) {
              this.logger.warn('Failed to load default settings from config:', error);
            }
          }

          // Update the settings manager with the new settings
          this.settings.updateSettings(this.settingsData);

          // Emit connected event with settings
          this.events.emit('connected', this.settingsData);

          // Update subscriptions (normal flow)
          this.updateSubscriptions();

          // If settings-based subscriptions are enabled, update those too
          if (this.shouldUpdateSubscriptionsOnSettingsChange && this.settingsData.length > 0) {
            this.updateSubscriptionsFromSettings();
          }
        }
        else if (isTpaConnectionError(message) || message.type === 'connection_error') {
          // Handle both TPA-specific connection_error and standard connection_error
          const errorMessage = message.message || 'Unknown connection error';
          this.events.emit('error', new Error(errorMessage));
        }
        else if (message.type === StreamType.AUDIO_CHUNK) {
          if (this.subscriptions.has(StreamType.AUDIO_CHUNK)) {
            // Only process if we're subscribed to avoid unnecessary processing
            this.events.emit(StreamType.AUDIO_CHUNK, message);
          }
        }
        else if (isDataStream(message)) {
          // Ensure streamType exists before emitting the event
          let messageStreamType = message.streamType as ExtendedStreamType;
          if (message.streamType === StreamType.TRANSCRIPTION) {
            const transcriptionData = message.data as TranscriptionData;
            if (transcriptionData.transcribeLanguage) {
              messageStreamType = createTranscriptionStream(transcriptionData.transcribeLanguage) as ExtendedStreamType;
            }
          } else if (message.streamType === StreamType.TRANSLATION) {
            const translationData = message.data as TranslationData;
            if (translationData.transcribeLanguage && translationData.translateLanguage) {
              messageStreamType = createTranslationStream(translationData.transcribeLanguage, translationData.translateLanguage) as ExtendedStreamType;
            }
          }

          if (messageStreamType && this.subscriptions.has(messageStreamType)) {
            const sanitizedData = this.sanitizeEventData(messageStreamType, message.data) as EventData<typeof messageStreamType>;
            this.events.emit(messageStreamType, sanitizedData);
          }
        }
        else if (isPhotoResponse(message)) {
          // Handle photo response by resolving the pending promise
          if (this.pendingPhotoRequests.has(message.requestId)) {
            const { resolve } = this.pendingPhotoRequests.get(message.requestId)!;
            resolve(message.photoUrl);
            this.pendingPhotoRequests.delete(message.requestId);
          }
        }
        else if (isSettingsUpdate(message)) {
          // Store previous settings to check for changes
          const prevSettings = [...this.settingsData];

          // Update internal settings storage
          this.settingsData = message.settings || [];

          // Update the settings manager with the new settings
          const changes = this.settings.updateSettings(this.settingsData);

          // Emit settings update event (for backwards compatibility)
          this.events.emit('settings_update', this.settingsData);

          // --- AugmentOS settings update logic ---
          // If the message.settings looks like AugmentOS settings (object with known keys), update augmentosSettings
          if (message.settings && typeof message.settings === 'object') {
            this.settings.updateAugmentosSettings(message.settings);
          }

          // Check if we should update subscriptions
          if (this.shouldUpdateSubscriptionsOnSettingsChange) {
            // Check if any subscription trigger settings changed
            const shouldUpdateSubs = this.subscriptionUpdateTriggers.some(key => {
              return key in changes;
            });

            if (shouldUpdateSubs) {
              this.updateSubscriptionsFromSettings();
            }
          }
        }
        else if (isAppStopped(message)) {
          const reason = message.reason || 'unknown';
          const displayReason = `App stopped: ${reason}`;

          // Emit disconnected event with clean closure info to prevent reconnection attempts
          this.events.emit('disconnected', {
            message: displayReason,
            code: 1000, // Normal closure code
            reason: displayReason,
            wasClean: true,
          });

          // Clear reconnection state
          this.reconnectAttempts = 0;
        }
        // Handle dashboard mode changes
        else if (isDashboardModeChanged(message)) {
          try {
            // Use proper type
            const mode = message.mode || 'none';

            // Update dashboard state in the API
            if (this.dashboard && 'content' in this.dashboard) {
              (this.dashboard.content as any).setCurrentMode(mode);
            }
          } catch (error) {
            this.logger.error({ error }, 'Error handling dashboard mode change');
          }
        }
        // Handle always-on dashboard state changes
        else if (isDashboardAlwaysOnChanged(message)) {
          try {
            // Use proper type
            const enabled = !!message.enabled;

            // Update dashboard state in the API
            if (this.dashboard && 'content' in this.dashboard) {
              (this.dashboard.content as any).setAlwaysOnEnabled(enabled);
            }
          } catch (error) {
            this.logger.error({ error }, 'Error handling dashboard always-on change');
          }
        }
        // Handle custom messages
        else if (message.type === CloudToTpaMessageType.CUSTOM_MESSAGE) {
          this.events.emit('custom_message', message);
          return;
        }
        // Handle 'connection_error' as a specific case if cloud sends this string literal
        else if ((message as any).type === 'connection_error') {
          // Treat 'connection_error' (string literal) like TpaConnectionError
          // This handles cases where the cloud might send the type as a direct string
          // instead of the enum's 'tpa_connection_error' value.
          const errorMessage = (message as any).message || 'Unknown connection error (type: connection_error)';
          this.logger.warn(`Received 'connection_error' type directly. Consider aligning cloud to send 'tpa_connection_error'. Message: ${errorMessage}`);
          this.events.emit('error', new Error(errorMessage));
        }
        else if (message.type === 'augmentos_settings_update') {
          const augmentosMsg = message as AugmentosSettingsUpdate;
          if (augmentosMsg.settings && typeof augmentosMsg.settings === 'object') {
            this.settings.updateAugmentosSettings(augmentosMsg.settings);
          }
        }
        // Handle 'connection_error' as a specific case if cloud sends this string literal
        else if ((message as any).type === 'connection_error') {
          // Treat 'connection_error' (string literal) like TpaConnectionError
          // This handles cases where the cloud might send the type as a direct string
          // instead of the enum's 'tpa_connection_error' value.
          const errorMessage = (message as any).message || 'Unknown connection error (type: connection_error)';
          this.logger.warn(`Received 'connection_error' type directly. Consider aligning cloud to send 'tpa_connection_error'. Message: ${errorMessage}`);
          this.events.emit('error', new Error(errorMessage));
        }
        // Handle media state update
        else if (isMediaStateUpdate(message)) {
          this.events.emit(StreamType.MEDIA_STATE, message.data);
        }
        // Handle media metadate update
        else if (isMediaMetadataUpdate(message)) {
          this.events.emit(StreamType.MEDIA_METADATA, message.data);
        } 
        // Handle media session end or no found media
        else if (isMediaSessionEndedUpdate(message)) {
          this.events.emit(StreamType.MEDIA_SESSION_ENDED, message.data);
        }
        // Handle unrecognized message types gracefully
        else {
          this.logger.warn(`((())) Unrecognized message type: ${(message as any).type}`);
          this.events.emit('error', new Error(`Unrecognized message type: ${(message as any).type}`));
        }
      } catch (processingError: unknown) {
        // Catch any errors during message processing to prevent TPA crashes
        this.logger.error('Error processing message:', processingError);
        const errorMessage = processingError instanceof Error ? processingError.message : String(processingError);
        this.events.emit('error', new Error(`Error processing message: ${errorMessage}`));
      }
    } catch (error: unknown) {
      // Final safety net to ensure the TPA doesn't crash on any unexpected errors
      this.logger.error({ error, message }, 'Unexpected error in message handler');
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.events.emit('error', new Error(`Unexpected error in message handler: ${errorMessage}`));
    }
  }

  /**
   * 🧪 Validate incoming message structure
   * @param message - Message to validate
   * @returns boolean indicating if the message is valid
   */
  private validateMessage(message: CloudToTpaMessage): boolean {
    // Handle ArrayBuffer case separately
    if (message instanceof ArrayBuffer) {
      return true; // ArrayBuffers are always considered valid at this level
    }

    // Check if message is null or undefined
    if (!message) {
      return false;
    }

    // Check if message has a type property
    if (!('type' in message)) {
      return false;
    }

    // All other message types should be objects with a type property
    return true;
  }

  /**
   * 📦 Handle binary message data (audio or video)
   * @param buffer - Binary data as ArrayBuffer
   */
  private handleBinaryMessage(buffer: ArrayBuffer): void {
    try {
      // Safety check - only process if we're subscribed to avoid unnecessary work
      if (!this.subscriptions.has(StreamType.AUDIO_CHUNK)) {
        return;
      }

      // Validate buffer has content before processing
      if (!buffer || buffer.byteLength === 0) {
        this.events.emit('error', new Error('Received empty binary message'));
        return;
      }

      // Create a safety wrapped audio chunk with proper defaults
      const audioChunk: AudioChunk = {
        type: StreamType.AUDIO_CHUNK,
        timestamp: new Date(),
        arrayBuffer: buffer,
        sampleRate: 16000 // Default sample rate
      };

      // Emit to subscribers
      this.events.emit(StreamType.AUDIO_CHUNK, audioChunk);
    } catch (error: unknown) {
      this.logger.error({ error }, 'Error processing binary message');
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.events.emit('error', new Error(`Error processing binary message: ${errorMessage}`));
    }
  }

  /**
   * 🧹 Sanitize event data to prevent crashes from malformed data
   * @param streamType - The type of stream data
   * @param data - The potentially unsafe data to sanitize
   * @returns Sanitized data safe for processing
   */
  private sanitizeEventData(streamType: ExtendedStreamType, data: unknown): any {
    try {
      // If data is null or undefined, return an empty object to prevent crashes
      if (data === null || data === undefined) {
        return {};
      }

      // For specific stream types, perform targeted sanitization
      switch (streamType) {
        case StreamType.TRANSCRIPTION:
          // Ensure text field exists and is a string
          if (typeof (data as TranscriptionData).text !== 'string') {
            return {
              text: '',
              isFinal: true,
              startTime: Date.now(),
              endTime: Date.now()
            };
          }
          break;

        case StreamType.HEAD_POSITION:
          // Ensure position data has required numeric fields
          // Handle HeadPosition - Note the property position instead of x,y,z
          const pos = data as any;
          if (typeof pos?.position !== 'string') {
            return { position: 'up', timestamp: new Date() };
          }
          break;

        case StreamType.BUTTON_PRESS:
          // Ensure button type is valid
          const btn = data as any;
          if (!btn.buttonId || !btn.pressType) {
            return { buttonId: 'unknown', pressType: 'short', timestamp: new Date() };
          }
          break;
      }

      return data;
    } catch (error: unknown) {
      this.logger.error({ error }, `Error sanitizing ${streamType} data`);
      // Return a safe empty object if something goes wrong
      return {};
    }
  }

  /**
   * 🔐 Send connection initialization message
   */
  private sendConnectionInit(): void {
    const message: TpaConnectionInit = {
      type: TpaToCloudMessageType.CONNECTION_INIT,
      sessionId: this.sessionId!,
      packageName: this.config.packageName,
      apiKey: this.config.apiKey,
      timestamp: new Date()
    };
    this.send(message);
  }

  /**
   * 📝 Update subscription list with cloud
   */
  private updateSubscriptions(): void {
    this.logger.info(`[TpaSession] updateSubscriptions: sending subscriptions to cloud:`, Array.from(this.subscriptions));
    const message: TpaSubscriptionUpdate = {
      type: TpaToCloudMessageType.SUBSCRIPTION_UPDATE,
      packageName: this.config.packageName,
      subscriptions: Array.from(this.subscriptions),
      sessionId: this.sessionId!,
      timestamp: new Date()
    };
    this.send(message);
  }

  /**
   * 🔄 Handle reconnection with exponential backoff
   */
  private async handleReconnection(): Promise<void> {
    // Check if reconnection is allowed
    if (!this.config.autoReconnect || !this.sessionId) {
      this.logger.debug(`🔄 Reconnection skipped: autoReconnect=${this.config.autoReconnect}, sessionId=${this.sessionId ? 'valid' : 'invalid'}`);
      return;
    }

    // Check if we've exceeded the maximum attempts
    const maxAttempts = this.config.maxReconnectAttempts || 3;
    if (this.reconnectAttempts >= maxAttempts) {
      this.logger.info(`🔄 Maximum reconnection attempts (${maxAttempts}) reached, giving up`);

      // Emit a permanent disconnection event to trigger onStop in the TPA server
      this.events.emit('disconnected', {
        message: `Connection permanently lost after ${maxAttempts} failed reconnection attempts`,
        code: 4000, // Custom code for max reconnection attempts exhausted
        reason: 'Maximum reconnection attempts exceeded',
        wasClean: false,
        permanent: true // Flag this as a permanent disconnection
      });

      return;
    }

    // Calculate delay with exponential backoff
    const baseDelay = this.config.reconnectDelay || 1000;
    const delay = baseDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.logger.debug(`🔄 [${this.config.packageName}] Reconnection attempt ${this.reconnectAttempts}/${maxAttempts} in ${delay}ms`);

    // Use the resource tracker for the timeout
    await new Promise<void>(resolve => {
      this.resources.setTimeout(() => resolve(), delay);
    });

    try {
      this.logger.debug(`🔄 [${this.config.packageName}] Attempting to reconnect...`);
      await this.connect(this.sessionId);
      this.logger.debug(`✅ [${this.config.packageName}] Reconnection successful!`);
      this.reconnectAttempts = 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ error }, `❌ [${this.config.packageName}] Reconnection failed for user ${this.userId}`);
      this.events.emit('error', new Error(`Reconnection failed: ${errorMessage}`));

      // Check if this was the last attempt
      if (this.reconnectAttempts >= maxAttempts) {
        this.logger.debug(`🔄 [${this.config.packageName}] Final reconnection attempt failed, emitting permanent disconnection`);

        // Emit permanent disconnection event after the last failed attempt
        this.events.emit('disconnected', {
          message: `Connection permanently lost after ${maxAttempts} failed reconnection attempts`,
          code: 4000, // Custom code for max reconnection attempts exhausted
          reason: 'Maximum reconnection attempts exceeded',
          wasClean: false,
          permanent: true // Flag this as a permanent disconnection
        });
      }
    }
  }

  /**
   * 📤 Send message to cloud with validation and error handling
   * @throws {Error} If WebSocket is not connected
   */
  private send(message: TpaToCloudMessage): void {
    try {
      // Verify WebSocket connection is valid
      if (!this.ws) {
        throw new Error('WebSocket connection not established');
      }

      if (this.ws.readyState !== 1) {
        const stateMap: Record<number, string> = {
          0: 'CONNECTING',
          1: 'OPEN',
          2: 'CLOSING',
          3: 'CLOSED'
        };
        const stateName = stateMap[this.ws.readyState] || 'UNKNOWN';
        throw new Error(`WebSocket not connected (current state: ${stateName})`);
      }

      // Validate message before sending
      if (!message || typeof message !== 'object') {
        throw new Error('Invalid message: must be an object');
      }

      if (!('type' in message)) {
        throw new Error('Invalid message: missing "type" property');
      }

      // Ensure message format is consistent
      if (!('timestamp' in message) || !(message.timestamp instanceof Date)) {
        message.timestamp = new Date();
      }

      // Try to send with error handling
      try {
        const serializedMessage = JSON.stringify(message);
        this.ws.send(serializedMessage);
      } catch (sendError: unknown) {
        const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
        throw new Error(`Failed to send message: ${errorMessage}`);
      }
    } catch (error: unknown) {
      // Log the error and emit an event so TPA developers are aware
      this.logger.error({ error }, 'Message send error');

      // Ensure we always emit an Error object
      if (error instanceof Error) {
        this.events.emit('error', error);
      } else {
        this.events.emit('error', new Error(String(error)));
      }

      // Re-throw to maintain the original function behavior
      throw error;
    }
  }
}