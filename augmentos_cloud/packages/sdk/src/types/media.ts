// src/media.ts

/**
 * Types of media status 
 * 
 * Mirror PlaybackStateCompat states
 */
export enum MediaStatusType {
    NONE = 'none',
    STOPPED = 'stopped',
    PAUSED = 'paused',
    PLAYING = 'playing',
    SKIPPING_TO_NEXT = 'skipping_to_next',
    SKIPPING_TO_PREVIOUS = 'skipping_to_previous',
    FAST_FORWARDING = 'fast_forwarding',
    REWINDING = 'rewinding',
    UNKNOWN = 'unknown'
}


/**
 * Structure for phone media playback state updates
 */
export interface MediaState {
    status: MediaStatusType; // Base media status type (e.g., PLAYING)
    position?: number;       // Playback position
    speed?: number;          // Playback speed (e.g., 1.0 for normal)
    actions?: number;        // Available actions (e.g., 4 = ACTION_PLAY)
    error?: string;          // Error message
}

/**
 * Structure for phone media metadata updates
 */
export interface MediaMetadata {
    packageName?: string;       // Package name of app playing media (e.g., "com.spotify.music")
    title?: string;             // Title of media (e.g., song title)
    artist?: string;            // Artist of media (e.g., song artist)
    album?: string;             // Album of media (e.g., song album)
    duration?: number;          // Length of media in seconds
}

/**
 * Structure for phone media session ends
 * No active session is found
 */
export interface MediaSessionEnded {
    packageName?: string;           // Package name of ended media
}