/**
 * Dashboard Manager TPA 
 * 
 * System TPA that provides the dashboard functionality for AugmentOS
 * using the SDK Dashboard API.
 */
import path from "path";
import { 
  TpaServer, 
  TpaSession, 
  StreamType, 
  DashboardMode, 
  HeadPosition,
  GlassesBatteryUpdate,
  LocationUpdate,
  PhoneNotification,
  CalendarEvent
} from '@augmentos/sdk';
import { logger, wrapText } from '@augmentos/utils';
import tzlookup from 'tz-lookup';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { WeatherModule, WeatherSummary } from './dashboard-modules/WeatherModule';
import { NotificationSummaryAgent } from '@augmentos/agents';

/**
 * Utility: Estimate if a location is in North America (rough bounding box)
 * Used to determine whether to display temperature in Fahrenheit or Celsius
 */
function isNorthAmerica(latitude: number, longitude: number): boolean {
  // North America bounding box: lat 7 to 84, lon -168 to -52
  return (
    latitude >= 7 && latitude <= 84 &&
    longitude >= -168 && longitude <= -52
  );
}

// Configuration constants
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const PACKAGE_NAME = "system.augmentos.dashboard";
const API_KEY = process.env.AUGMENTOS_AUTH_JWT_SECRET || '';

// Validate API key
if (!API_KEY) {
  logger.error("AUGMENTOS_AUTH_JWT_SECRET environment variable is required.");
  process.exit(1);
}

// List of notification app names to ignore
const notificationAppBlackList = ['youtube', 'augment', 'maps'];

/**
 * Dashboard Manager TPA - Main application class
 * 
 * This is the system dashboard TPA that manages system information
 * display and dashboard mode control. It uses the AugmentOS SDK's
 * dashboard.system API to update dashboard sections and control modes.
 */
class DashboardServer extends TpaServer {
  // Keep track of active sessions with their metadata
  private _activeSessions: Map<string, {
    userId: string;
    batteryLevel?: number;
    latestLocation?: { latitude: number; longitude: number; timezone?: string };
    phoneNotificationCache: { title: string; content: string; timestamp: number; uuid: string }[];
    phoneNotificationRanking?: { summary: string; timestamp: number }[];
    calendarEvent?: any;
    weatherCache?: { timestamp: number; data: string };
    useFahrenheit?: boolean; // Whether to use Fahrenheit (true) or Celsius (false)
    dashboardMode: DashboardMode;
    updateInterval?: NodeJS.Timeout;
  }> = new Map();

  private notificationSummaryAgent: NotificationSummaryAgent;

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      port: PORT,
      apiKey: API_KEY,
      publicDir: path.join(__dirname, "./public"),
    });
    
    this.notificationSummaryAgent = new NotificationSummaryAgent();
    
    logger.info('Dashboard Manager initialized with configuration', { 
      packageName: PACKAGE_NAME,
      port: PORT
    });
  }

  /**
   * Called by TpaServer when a new session is created
   */
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    logger.info(`🚀 New dashboard session started for user ${userId}`, {
      sessionId,
      userId,
      timestamp: new Date().toISOString()
    });
    
    // Initialize session metadata
    this._activeSessions.set(sessionId, {
      userId,
      phoneNotificationCache: [],
      dashboardMode: DashboardMode.MAIN
    });
    
    logger.info(`📊 Dashboard session initialized with mode: ${DashboardMode.MAIN}`);

    // Set up event handlers for this session
    this.setupEventHandlers(session, sessionId);
    logger.info(`✅ Event handlers set up for session ${sessionId}`);
    
    // Initialize dashboard content and state
    this.initializeDashboard(session, sessionId);
    logger.info(`✅ Dashboard initialized for session ${sessionId}`);
    
    // Set up settings handlers
    this.setupSettingsHandlers(session, sessionId);
    logger.info(`✅ Settings handlers set up for session ${sessionId}`);
    
    // Start dashboard update interval
    const updateInterval = setInterval(() => {
      logger.info(`⏰ Scheduled dashboard update triggered for session ${sessionId}`);
      this.updateDashboardSections(session, sessionId);
    }, 60000); // Update every minute
    
    // Store the interval reference for cleanup
    const sessionInfo = this._activeSessions.get(sessionId);
    if (sessionInfo) {
      sessionInfo.updateInterval = updateInterval;
      logger.info(`✅ Dashboard update interval scheduled for session ${sessionId}`);
    }
    
    logger.info(`✅ Dashboard session setup completed for user ${userId}`, {
      sessionId,
      activeSessionCount: this._activeSessions.size
    });
  }
  
  /**
   * Set up handlers for settings changes
   */
  private setupSettingsHandlers(session: TpaSession, sessionId: string): void {
    // Listen for specific setting changes
    session.settings.onValueChange('dashboard_content', (newValue, oldValue) => {
      logger.info(`Dashboard content setting changed from ${oldValue} to ${newValue} for session ${sessionId}`);
      
      // Apply the setting change immediately
      this.updateDashboardSections(session, sessionId);
    });
    
    // Get and log current settings
    const dashboardContent = session.settings.get('dashboard_content', 'none');
    logger.info(`Current dashboard content setting: ${dashboardContent} for session ${sessionId}`);
  }

  /**
   * Called by TpaServer when a session is stopped
   */
  protected async onStop(
    sessionId: string,
    userId: string,
    reason: string
  ): Promise<void> {
    logger.info(`Dashboard session stopped: ${reason}`, { userId });

    // Clean up any intervals
    const sessionInfo = this._activeSessions.get(sessionId);
    if (sessionInfo?.updateInterval) {
      clearInterval(sessionInfo.updateInterval);
    }
    
    // Remove from active sessions map
    this._activeSessions.delete(sessionId);
    
    logger.info(`Dashboard session resources cleaned up`, { 
      activeSessionCount: this._activeSessions.size 
    });
  }
  
  /**
   * Set up event handlers for a session
   */
  private setupEventHandlers(session: TpaSession, sessionId: string): void {
    // Handle phone notifications
    session.onPhoneNotifications((data) => {
      this.handlePhoneNotification(session, sessionId, data);
    });
    
    // Handle location updates
    session.on(StreamType.LOCATION_UPDATE, (data: LocationUpdate) => {
      this.handleLocationUpdate(session, sessionId, data);
    });
    
    // Handle head position changes
    session.onHeadPosition((data) => {
      if (data.position === 'up') {
        this.updateDashboardSections(session, sessionId);
      }
    });
    
    // Handle battery updates
    session.on(StreamType.GLASSES_BATTERY_UPDATE, (data: GlassesBatteryUpdate) => {
      this.handleBatteryUpdate(session, sessionId, data);
    });
    
    // Handle calendar events
    session.on(StreamType.CALENDAR_EVENT, (data: CalendarEvent) => {
      this.handleCalendarEvent(session, sessionId, data);
    });
    
    // Handle dashboard mode changes (from cloud side)
    session.dashboard.content.onModeChange((mode) => {
      if (mode === 'none') return;
      
      const sessionInfo = this._activeSessions.get(sessionId);
      if (!sessionInfo) return;
      
      sessionInfo.dashboardMode = mode;
      logger.info(`Dashboard mode changed to ${mode} for session ${sessionId}`);
      this.updateDashboardSections(session, sessionId);
    });
  }
  
  /**
   * Initialize dashboard content and state
   */
  private initializeDashboard(session: TpaSession, sessionId: string): void {
    const sessionInfo = this._activeSessions.get(sessionId);
    if (!sessionInfo) {
      logger.error(`❌ Failed to initialize dashboard: session info not found for ${sessionId}`);
      return;
    }
    
    logger.info(`🛠️ Initializing dashboard for session ${sessionId}`);
    
    // Set dashboard to main mode
    try {
      logger.info(`🔄 Setting dashboard mode to ${DashboardMode.MAIN} for session ${sessionId}`);
      session.dashboard.system?.setViewMode(DashboardMode.MAIN);
      sessionInfo.dashboardMode = DashboardMode.MAIN;
      logger.info(`✅ Dashboard mode set to ${DashboardMode.MAIN} for session ${sessionId}`);
    } catch (error) {
      logger.error(`❌ Error setting dashboard mode: ${error}`);
    }
    
    // Initialize dashboard sections
    try {
      logger.info(`🔄 Initializing dashboard sections for session ${sessionId}`);
      this.updateDashboardSections(session, sessionId);
      logger.info(`✅ Dashboard sections initialized for session ${sessionId}`);
    } catch (error) {
      logger.error(`❌ Error initializing dashboard sections: ${error}`);
    }
  }
  
  /**
   * Update all dashboard sections with current data
   */
  private updateDashboardSections(session: TpaSession, sessionId: string): void {
    logger.info(`🔄 Updating dashboard sections for session ${sessionId}`);
    
    const sessionInfo = this._activeSessions.get(sessionId);
    if (!sessionInfo) {
      logger.error(`❌ Failed to update dashboard: session info not found for ${sessionId}`);
      return;
    }
    
    try {
      // Format time and battery together for top left (to match original format)
      const timeText = this.formatTimeSection(sessionInfo);
      const batteryText = this.formatBatterySection(sessionInfo);
      const topLeftText = `${timeText}, ${batteryText}`;
      
      logger.info(`📊 Setting top-left dashboard section for session ${sessionId}`, {
        timeText: timeText,
        batteryText: batteryText
      });
      
      session.dashboard.system?.setTopLeft(topLeftText);
      logger.info(`✅ Top-left section updated for session ${sessionId}`);

      // Format status section (weather, calendar, etc.)
      const statusText = this.formatStatusSection(sessionInfo);
      logger.info(`📊 Setting top-right dashboard section for session ${sessionId}`, {
        statusText: statusText.substring(0, 30) + (statusText.length > 30 ? '...' : '')
      });
      
      session.dashboard.system?.setTopRight(statusText);
      logger.info(`✅ Top-right section updated for session ${sessionId}`);

      // Format notification section
      const notificationText = this.formatNotificationSection(sessionInfo);
      logger.info(`📊 Setting bottom-left dashboard section for session ${sessionId}`, {
        notificationText: notificationText ? 
          notificationText.substring(0, 30) + (notificationText.length > 30 ? '...' : '') : 
          'empty'
      });
      
      session.dashboard.system?.setBottomLeft(notificationText);
      logger.info(`✅ Bottom-left section updated for session ${sessionId}`);

      // Don't send bottom right since we're not using it in the original format
      session.dashboard.system?.setBottomRight("");
      
      logger.info(`✅ All dashboard sections updated successfully for session ${sessionId}`);
    } catch (error) {
      logger.error(`❌ Error updating dashboard sections for session ${sessionId}:`, error);
    }
  }
  
  /**
   * Format time section text
   */
  private formatTimeSection(sessionInfo: any): string {
    // Check if we have a valid timezone from location
    if (!sessionInfo.latestLocation?.timezone) {
      return "◌ $DATE$, $TIME12$";
    }
  
    try {
      const timezone = sessionInfo.latestLocation.timezone;
      const options = {
        timeZone: timezone,
        hour: "2-digit" as const,
        minute: "2-digit" as const,
        month: "numeric" as const,
        day: "numeric" as const,
        hour12: true
      };
      let formatted = new Date().toLocaleString("en-US", options);
      formatted = formatted.replace(/ [AP]M/, "");
      return `◌ ${formatted}`;
    } catch (error) {
      logger.error(`Error formatting time:`, error);
      return "◌ $DATE$, $TIME12$";
    }
  }
  
  /**
   * Format battery section text
   */
  private formatBatterySection(sessionInfo: any): string {
    return (typeof sessionInfo.batteryLevel === 'number')
      ? `${sessionInfo.batteryLevel}%`
      : "$GBATT$";
  }
  
  /**
   * Format notification section text
   */
  private formatNotificationSection(sessionInfo: any): string {
    // Use ranked notifications if available, otherwise use the raw cache
    const notifications = sessionInfo.phoneNotificationRanking || 
                      sessionInfo.phoneNotificationCache || [];
    
    if (notifications.length === 0) return "";
  
    // Take the latest 2 notifications
    const topNotifications = notifications.slice(0, 2);
    
    // Format differently based on whether we're using ranked or raw notifications
    if (topNotifications.length > 0 && 'summary' in topNotifications[0]) {
      return topNotifications
        .map((notification: { summary: string; timestamp: number }) => 
          wrapText(notification.summary, 25))
        .join('\n');
    } else {
      return topNotifications
        .map((notification: { title: string; content: string; timestamp: number; uuid: string }) => 
          `${notification.title}: ${notification.content}`)
        .join('\n');
    }
  }
  
  /**
   * Format status section text
   */
  private formatStatusSection(sessionInfo: any): string {
    // Prioritize calendar events if available
    if (sessionInfo.calendarEvent) {
      return this.formatCalendarEvent(sessionInfo.calendarEvent, sessionInfo);
    }
    
    // Then weather if available
    if (sessionInfo.weatherCache) {
      return sessionInfo.weatherCache.data;
    }
    
    // Default status note: previously "Status: connected".
    return "";
  }
  
  /**
   * Format calendar event
   */
  private formatCalendarEvent(event: any, sessionInfo: any): string {
    try {
      const timezone = sessionInfo.latestLocation?.timezone;

      let eventDate: Date;
      if (timezone) {
        // Convert the event start time into a localized Date object
        const localized = new Date(new Date(event.dtStart).toLocaleString("en-US", { timeZone: timezone }));
        eventDate = localized;
      } else {
        eventDate = new Date(event.dtStart); // fallback
      }

      const formattedTime = eventDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      }).replace(" ", "");

      const title = event.title.length > 10 
        ? event.title.substring(0, 7).trim() + '...' 
        : event.title;

      return `${title} @ ${formattedTime}`;
    } catch (error) {
      logger.error('Error formatting calendar event', error);
      return "Calendar event";
    }
  }
  
  /**
   * Handle phone notification event
   */
  private async handlePhoneNotification(session: TpaSession, sessionId: string, data: PhoneNotification): Promise<void> {
    const sessionInfo = this._activeSessions.get(sessionId);
    if (!sessionInfo) return;

    // Check if the app name is blacklisted
    if (data.app && notificationAppBlackList.some(app => 
      data.app.toLowerCase().includes(app))) {
      logger.debug(`Notification from ${data.app} is blacklisted.`);
      return;
    }

    // Add notification to cache
    const newNotification = {
      title: data.title || 'No Title',
      content: data.content || '',
      timestamp: Date.now(),
      uuid: uuidv4(),
      appName: data.app || '',
      text: data.content || ''
    };

    // Prevent duplicate notifications
    const cache = sessionInfo.phoneNotificationCache;
    if (cache.length > 0) {
      const lastNotification = cache[cache.length - 1];
      if (lastNotification.title === newNotification.title &&
          lastNotification.content === newNotification.content) {
        logger.debug(`Duplicate notification detected. Not adding to cache.`);
        return;
      }
    }

    // Add to cache
    sessionInfo.phoneNotificationCache.push(newNotification);

    // Use NotificationSummaryAgent to process and rank notifications
    try {
      const ranking = await this.notificationSummaryAgent.handleContext({
        notifications: sessionInfo.phoneNotificationCache
      });
      sessionInfo.phoneNotificationRanking = ranking.map((n: any) => ({
        summary: n.summary,
        timestamp: new Date(n.timestamp).getTime() || Date.now()
      }));
      logger.info('NotificationSummaryAgent ranking:', { ranking });
    } catch (err) {
      logger.error('Error using NotificationSummaryAgent:', err);
      // fallback: use manual summary as before
      sessionInfo.phoneNotificationRanking = sessionInfo.phoneNotificationCache
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(notification => ({
          summary: `${notification.title}: ${notification.content}`,
          timestamp: notification.timestamp
        }));
    }

    // Update dashboard sections
    this.updateDashboardSections(session, sessionId);
  }
  
  /**
   * Handle location update event
   */
  private async handleLocationUpdate(session: TpaSession, sessionId: string, data: LocationUpdate): Promise<void> {
    const sessionInfo = this._activeSessions.get(sessionId);
    if (!sessionInfo) return;
  
    // Extract lat, lng from location data
    const { lat, lng } = data;
    
    // Skip if invalid coordinates
    if (typeof lat !== "number" || typeof lng !== "number") {
      logger.error(`Invalid location data:`, data);
      return;
    }
    
    // Determine timezone from coordinates
    let timezone: string | undefined;
    try {
      timezone = tzlookup(lat, lng);
    } catch (error) {
      logger.error(`Error looking up timezone for lat=${lat}, lng=${lng}:`, error);
    }
    
    // Determine if we should use Fahrenheit based on location
    const useFahrenheit = isNorthAmerica(lat, lng);
    sessionInfo.useFahrenheit = useFahrenheit;
    logger.info(`Location in North America: ${useFahrenheit}, will use ${useFahrenheit ? 'Fahrenheit' : 'Celsius'}`);
    
    // Update location in session
    sessionInfo.latestLocation = { 
      latitude: lat, 
      longitude: lng,
      timezone: timezone || sessionInfo.latestLocation?.timezone
    };
    
    // Fetch weather data if we don't have recent weather or location changed significantly
    const shouldFetchWeather = !sessionInfo.weatherCache || 
                              (Date.now() - (sessionInfo.weatherCache.timestamp || 0) > 60 * 60 * 1000); // 1 hour
    
    if (shouldFetchWeather) {
      try {
        const weatherModule = new WeatherModule();
        const weatherData = await weatherModule.fetchWeatherForecast(lat, lng);
        
        if (weatherData) {
          // Use Fahrenheit for North America, Celsius for rest of world
          const temp = useFahrenheit ? weatherData.temp_f : weatherData.temp_c;
          const unit = useFahrenheit ? '°F' : '°C';
          
          sessionInfo.weatherCache = {
            timestamp: Date.now(),
            data: `${weatherData.condition}, ${temp}${unit}`
          };
          
          logger.info(`Weather updated: ${sessionInfo.weatherCache.data}`);
        }
      } catch (error) {
        logger.error(`Error fetching weather for session ${sessionId}:`, error);
      }
    }
  
    // Update dashboard with location info
    this.updateDashboardSections(session, sessionId);
  }
  
  /**
   * Handle battery update event
   */
  private handleBatteryUpdate(session: TpaSession, sessionId: string, data: GlassesBatteryUpdate): void {
    const sessionInfo = this._activeSessions.get(sessionId);
    if (!sessionInfo) return;
  
    // Update battery level if it changed
    if (typeof data.level === 'number' && sessionInfo.batteryLevel !== data.level) {
      sessionInfo.batteryLevel = data.level;
      this.updateDashboardSections(session, sessionId);
    }
  }
  
  /**
   * Handle calendar event
   */
  private handleCalendarEvent(session: TpaSession, sessionId: string, event: CalendarEvent): void {
    const sessionInfo = this._activeSessions.get(sessionId);
    if (!sessionInfo) return;
  
    // Validate event structure
    if (!event.title || !event.dtStart) {
      logger.error(`Invalid calendar event structure:`, event);
      return;
    }
  
    // Update calendar event
    sessionInfo.calendarEvent = event;
    this.updateDashboardSections(session, sessionId);
  }
  
  /**
   * Get all active dashboard sessions
   */
  public getActiveSessions(): string[] {
    return Array.from(this._activeSessions.keys());
  }
  
}

// ===========================================
// Additional Routes Configuration
// ===========================================

// Create and start the dashboard manager
const dashboardServer = new DashboardServer();


// Start the server
dashboardServer.start().then(() => {
  logger.info(`Dashboard Manager TPA running on port ${PORT}`);
}).catch(error => {
  logger.error('Failed to start Dashboard Manager:', error);
  process.exit(1);
});

// Export the server instance for testing
export { dashboardServer };