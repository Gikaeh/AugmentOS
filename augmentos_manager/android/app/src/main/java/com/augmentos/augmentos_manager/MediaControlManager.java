package com.augmentos.augmentos_manager;

import android.content.ComponentName;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import android.media.session.MediaSessionManager;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.support.v4.media.session.MediaControllerCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.MediaMetadataCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;
import java.util.Objects;

public class MediaControlManager {
    private static final String TAG = "MediaControlManager";

    private MediaSessionManager mediaSessionManager;
    private MediaControllerCompat activeMediaController;
    private MediaControllerCompat.Callback mediaControllerCallback;
    private final MediaEventListener eventListener; // To send updates (e.g., to NotificationService)

    private final ComponentName listenerComponentName; // ComponentName of NotificationService

    private String currentTrackId = ""; // To avoid redundant metadata updates
    private String currentPackageName = ""; // To track current media app package

    private final Context context;
    private final Handler mainHandler; // For posting callbacks on the main thread

    public interface MediaEventListener {
        void onMediaUpdate(String eventName, String jsonDataString);
    }

    public MediaControlManager(Context context, ComponentName listenerComponentName, MediaEventListener eventListener) {
        this.context = context.getApplicationContext();
        this.listenerComponentName = listenerComponentName;
        this.eventListener = eventListener;
        this.mainHandler = new Handler(Looper.getMainLooper());

        try {
            this.mediaSessionManager = (MediaSessionManager) this.context.getSystemService(Context.MEDIA_SESSION_SERVICE);
            if (this.mediaSessionManager == null) {
                Log.e(TAG, "MediaSessionManager is null. Media control will not function.");
                return;
            }
            setupMediaControllerCallback();
        } catch (Exception e) {
            Log.e(TAG, "Error initializing MediaControlManager: " + e.getMessage(), e);
        }
    }

    private void setupMediaControllerCallback() {
        mediaControllerCallback = new MediaControllerCompat.Callback() {
            @Override
            public void onPlaybackStateChanged(PlaybackStateCompat state) {
                Log.d(TAG, "Media PlaybackState Changed: " + (state != null ? state.getState() : "null state") + " for pkg " + (activeMediaController != null ? activeMediaController.getPackageName() : "unknown"));
                if (eventListener != null) {
                    try {
                        JSONObject playbackStateJson = new JSONObject();
                        if (state != null) {
                            playbackStateJson.put("status", getPlaybackStatusString(state.getState())); // Status of playback (e.g., Playing == 3, Pausing == 2)
                            playbackStateJson.put("speed", state.getPlaybackSpeed()); // Current speed of media (e.g., 1.0, 0.0 paused)
                            playbackStateJson.put("actions", state.getActions()); // Available actions bitmask
                            playbackStateJson.put("position", state.getPosition()/1000);
                            if (state.getState() == PlaybackStateCompat.STATE_ERROR) {
                                CharSequence errorMessage = state.getErrorMessage();
                                playbackStateJson.put("error", errorMessage != null ? errorMessage.toString() : "Unknown error");
                            }
                        } else {
                            playbackStateJson.put("status", getPlaybackStatusString(PlaybackStateCompat.STATE_NONE));
                            playbackStateJson.put("position", 0);
                            playbackStateJson.put("speed", 0.0f);
                            playbackStateJson.put("actions", 0L);
                        }
                        eventListener.onMediaUpdate(ManagerMediaConstants.MEDIA_EVENT_STATE_CHANGED, playbackStateJson.toString());
                    } catch (JSONException e) {
                        Log.e(TAG, "JSONException in onPlaybackStateChanged: " + e.getMessage(), e);
                    }
                }
            }

            @Override
            public void onMetadataChanged(MediaMetadataCompat metadata) {
                String newTrackId = "";
                String newPackageName = activeMediaController != null ? activeMediaController.getPackageName() : "";

                // Set baseline newTrackId to compare to currentTrackId
                if (metadata != null) {
                    String title = metadata.getString(MediaMetadataCompat.METADATA_KEY_TITLE);
                    String artist = metadata.getString(MediaMetadataCompat.METADATA_KEY_ARTIST);
                    newTrackId = (title != null ? title : "") + "##" + (artist != null ? artist : "");
                }

                boolean metadataIsNullNow = (metadata == null);
                boolean trackIdChanged = !Objects.equals(newTrackId, currentTrackId) && !(newTrackId.equals("##") && currentTrackId.equals("##") && Objects.equals(newPackageName, currentPackageName)) ;
                boolean packageChanged = !Objects.equals(newPackageName, currentPackageName);

                if (trackIdChanged || packageChanged || (metadataIsNullNow && !currentTrackId.isEmpty() && !currentTrackId.equals("##"))) {
                    Log.d(TAG, "Media Metadata Changed. New Track ID: " + newTrackId + ", Old: " + currentTrackId + ", Pkg: " + newPackageName);
                    currentTrackId = newTrackId;
                    currentPackageName = newPackageName;

                    if (eventListener != null) {
                        try {
                            JSONObject metadataJson = new JSONObject();
                            metadataJson.put("packageName", newPackageName != null ? newPackageName : (activeMediaController != null ? activeMediaController.getPackageName() : ""));
                            if (metadata != null) {
                                metadataJson.put("title", metadata.getString(MediaMetadataCompat.METADATA_KEY_TITLE)); // Media title
                                metadataJson.put("artist", metadata.getString(MediaMetadataCompat.METADATA_KEY_ARTIST)); // Media artist
                                metadataJson.put("album", metadata.getString(MediaMetadataCompat.METADATA_KEY_ALBUM)); // Media album
                                metadataJson.put("duration", metadata.getLong(MediaMetadataCompat.METADATA_KEY_DURATION) / 1000); // Length of media in seconds
                            } else {
                                // Send empty fields if metadata is null but session might still exist
                                metadataJson.put("title", JSONObject.NULL);
                                metadataJson.put("artist", JSONObject.NULL);
                                metadataJson.put("album", JSONObject.NULL);
                                metadataJson.put("duration", 0);
                            }
                            eventListener.onMediaUpdate(ManagerMediaConstants.MEDIA_EVENT_METADATA_CHANGED, metadataJson.toString());
                        } catch (JSONException e) {
                            Log.e(TAG, "JSONException in onMetadataChanged: " + e.getMessage(), e);
                        }
                    }
                } else {
                    Log.d(TAG, "Media Metadata effectively unchanged (Track ID: " + newTrackId + ", Pkg: " + newPackageName + "), not sending update.");
                }
            }

            @Override
            public void onSessionDestroyed() {
                String destroyedPackageName = activeMediaController != null ? activeMediaController.getPackageName() : currentPackageName; // Use current if active already nulled
                Log.d(TAG, "Media Session Destroyed for controller: " + destroyedPackageName);
                cleanupCurrentControllerAndState(); // Clears activeMediaController

                if (eventListener != null && destroyedPackageName != null && !destroyedPackageName.isEmpty()) {
                    try {
                        JSONObject sessionEndedJson = new JSONObject();
                        sessionEndedJson.put("packageName", destroyedPackageName);
                        eventListener.onMediaUpdate(ManagerMediaConstants.MEDIA_EVENT_SESSION_ENDED, sessionEndedJson.toString());
                    } catch (JSONException e) {
                        Log.e(TAG, "JSONException in onSessionDestroyed: " + e.getMessage(), e);
                    }
                }
                // After handling a destroyed session, check if another one became active
                mainHandler.post(MediaControlManager.this::checkForActiveSessions);
            }
        };
    }

    private String getPlaybackStatusString(int state) {
        switch (state) {
            case PlaybackStateCompat.STATE_NONE: return "none";
            case PlaybackStateCompat.STATE_STOPPED: return "stopped";
            case PlaybackStateCompat.STATE_PAUSED: return "paused";
            case PlaybackStateCompat.STATE_PLAYING: return "playing";
            case PlaybackStateCompat.STATE_SKIPPING_TO_PREVIOUS: return "skipping_to_previous";
            case PlaybackStateCompat.STATE_SKIPPING_TO_NEXT: return "skipping_to_next";
            case PlaybackStateCompat.STATE_FAST_FORWARDING: return "fast_forwarding";
            case PlaybackStateCompat.STATE_REWINDING: return "rewinding";
            case PlaybackStateCompat.STATE_BUFFERING: return "buffering";
            case PlaybackStateCompat.STATE_ERROR: return "error";
            default: return "unknown";
        }
    }

    public synchronized void checkForActiveSessions() {
        if (mediaSessionManager == null || listenerComponentName == null) {
            Log.w(TAG, "MediaSessionManager or listenerComponentName not initialized for checkForActiveSessions.");
            return;
        }
        List<MediaControllerCompat> controllersCompat;
        try {
            List<MediaController> controllers = mediaSessionManager.getActiveSessions(listenerComponentName); // Grabs all active session of media
            if (controllers == null || controllers.isEmpty()) {
                 if (activeMediaController != null) {
                    Log.d(TAG, "No active media sessions found by manager, current controller (" + activeMediaController.getPackageName() + ") might be stale or session ended without destroy callback.");
                    String lastPackageName = activeMediaController.getPackageName();
                    cleanupCurrentControllerAndState(); // This will nullify activeMediaController
                     if (eventListener != null && lastPackageName != null && !lastPackageName.isEmpty()) {
                        try {
                            JSONObject noSessionJson = new JSONObject();
                            noSessionJson.put("packageName", lastPackageName);
                            eventListener.onMediaUpdate(ManagerMediaConstants.MEDIA_EVENT_SESSION_ENDED, noSessionJson.toString());
                        } catch (Exception e) { Log.e(TAG, "Error sending no active session event: " + e.getMessage(), e); }
                    }
                } else { Log.d(TAG, "No active media sessions found by manager, and no active controller was being tracked."); }
                return;
            }

            controllersCompat = new java.util.ArrayList<>();
            for (MediaController mc : controllers) {
                MediaSession.Token platformToken = mc.getSessionToken();
                MediaSessionCompat.Token compatToken = MediaSessionCompat.Token.fromToken(platformToken);
                if (compatToken != null) {
                    controllersCompat.add(new MediaControllerCompat(context, compatToken));
                } else {
                    Log.w(TAG, "Failed to create MediaSessionCompat.Token for controller: " + mc.getPackageName());
                }
            }

        } catch (SecurityException se) {
             Log.e(TAG, "SecurityException getting active media sessions. Ensure Notification Listener permission is granted and service is bound.", se);
             // Potentially, inform JS layer about permission issue
             return;
        } catch (Exception e) {
            Log.e(TAG, "Error getting active media sessions: " + e.getMessage(), e);
            return;
        }
        Log.d(TAG, "Found " + controllersCompat.size() + " active media sessions via MediaSessionManager.");

        MediaControllerCompat targetController = null;
        // Prioritize playing sessions
        for (MediaControllerCompat controller : controllersCompat) {
            PlaybackStateCompat state = controller.getPlaybackState();
            if (state != null && state.getState() == PlaybackStateCompat.STATE_PLAYING) {
                targetController = controller;
                Log.d(TAG, "Found playing session: " + controller.getPackageName());
                break;
            }
        }
        // If no playing session, take the first one (often the most recent)
        if (targetController == null && !controllersCompat.isEmpty()) {
            targetController = controllersCompat.get(0);
            Log.d(TAG, "No playing session, defaulting to first active session: " + targetController.getPackageName());
        }

        if (targetController != null) {
            if (activeMediaController == null || !activeMediaController.getSessionToken().equals(targetController.getSessionToken())) {
                Log.d(TAG, "Switching media controller to: " + targetController.getPackageName());
                cleanupCurrentControllerAndState(); // Unregister from old one
                activeMediaController = targetController;
                currentPackageName = activeMediaController.getPackageName(); // Update current package name
                try {
                    activeMediaController.registerCallback(mediaControllerCallback, mainHandler); // Use main handler
                    currentTrackId = ""; // Reset currentTrackId for the new session to force metadata update
                    // Immediately send current state and metadata for the new controller
                    PlaybackStateCompat state = activeMediaController.getPlaybackState();
                    MediaMetadataCompat metadata = activeMediaController.getMetadata();
                    // Check if media has state
                    if (state != null) {
                        mediaControllerCallback.onPlaybackStateChanged(state); 
                    } else {
                        mediaControllerCallback.onPlaybackStateChanged(null); // Send even if null
                    }
                    // Check if media has metadate
                    if (metadata != null) {
                        mediaControllerCallback.onMetadataChanged(metadata); 
                    } else {
                        mediaControllerCallback.onMetadataChanged(null); // Send even if null
                    }

                } catch (Exception e) {
                    Log.e(TAG, "Error registering new media callback or fetching initial state for " + activeMediaController.getPackageName() + ": " + e.getMessage(), e);
                    activeMediaController = null; // Failed to use this controller
                    currentTrackId = "";
                    currentPackageName = "";
                }
            } else {
                Log.d(TAG, "Already monitoring controller: " + activeMediaController.getPackageName() + ". Refreshing state.");
                PlaybackStateCompat state = activeMediaController.getPlaybackState();
                MediaMetadataCompat metadata = activeMediaController.getMetadata();
                if (state != null) {
                    mediaControllerCallback.onPlaybackStateChanged(state);
                }
                if (metadata != null) {
                    mediaControllerCallback.onMetadataChanged(metadata);
                }
            }
        } else { // No target controller found
            if (activeMediaController != null) {
                Log.d(TAG, "No suitable active session found, but was tracking " + activeMediaController.getPackageName() + ". Cleaning up.");
                String lastPackageName = activeMediaController.getPackageName();
                cleanupCurrentControllerAndState();
                if (eventListener != null && lastPackageName != null && !lastPackageName.isEmpty()) {
                    try {
                        JSONObject noSessionJson = new JSONObject();
                        noSessionJson.put("packageName", lastPackageName);
                        eventListener.onMediaUpdate(ManagerMediaConstants.MEDIA_EVENT_SESSION_ENDED, noSessionJson.toString());
                    } catch (Exception e) {
                        Log.e(TAG, "Error sending no active session event: " + e.getMessage(), e);
                    }
                }
            }
        }
    }

    public void handleMediaControlCommand(String action, long value) { // Value is for SEEK, in milliseconds, SEEK NOT CURRENTLY IMPLEMENTED
        Log.d(TAG, "MediaControlManager handling command: " + action + (action.equalsIgnoreCase("SEEK") ? " to " + value/1000 + "s" : ""));
        if (activeMediaController == null || activeMediaController.getTransportControls() == null) {
            Log.w(TAG, "No active media controller for command: " + action + ". Attempting to find one.");
            checkForActiveSessions(); // Try to find a session

            if (activeMediaController == null || activeMediaController.getTransportControls() == null) {
                Log.w(TAG, "Still no active media controller after check for command: " + action);
                return;
            }
            Log.d(TAG, "Found active media controller: " + activeMediaController.getPackageName() + " after check for command " + action);
        }

        MediaControllerCompat.TransportControls transportControls = activeMediaController.getTransportControls();
        try {
            switch (action.toUpperCase()) {
                case ManagerMediaConstants.MEDIA_ACTION_PLAY:
                    transportControls.play();
                    break;

                case ManagerMediaConstants.MEDIA_ACTION_PAUSE:
                    transportControls.pause();
                    break;

                case ManagerMediaConstants.MEDIA_ACTION_NEXT:
                    transportControls.skipToNext();
                    break;

                case ManagerMediaConstants.MEDIA_ACTION_PREVIOUS:
                    transportControls.skipToPrevious();
                    break;

                // case MediaControlEvent.ACTION_SHUFFLE:
                //     transportControls.setShuffleMode(); // Need to grab current mode to do oppisite of (0 == None; 1 == Shuffle All)
                //     break;

                // case MediaControlEvent.ACTION_REPEAT:
                //     transportControls.setRepeatMode(); // Need to grab current mode to do oppisite of (0 == None; 2 == Repeat All)
                //     break;

                // case MediaControlEvent.ACTION_SEEK:
                //     if (value >= 0) { // value is expected in milliseconds for seekTo
                //         transportControls.seekTo(value);
                //     } else {
                //         Log.w(TAG, "Invalid seek value: " + value);
                //     }
                //     break;

                default:
                    Log.w(TAG, "Unknown media control action: " + action);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error executing media control " + action + ": " + e.getMessage(), e);
        }
    }

    public void cleanup() {
        Log.d(TAG, "MediaControlManager cleanup called.");
        mainHandler.removeCallbacksAndMessages(null); // Remove any pending posts
        cleanupCurrentControllerAndState();
        mediaSessionManager = null; // Release system service reference
        // eventListener and context are passed in, their lifecycle is managed externally
    }

    private void cleanupCurrentControllerAndState() {
        if (activeMediaController != null) {
            try {
                Log.d(TAG, "Unregistering callback for controller: " + activeMediaController.getPackageName());
                activeMediaController.unregisterCallback(mediaControllerCallback);
            } catch (Exception e) {
                Log.e(TAG, "Error unregistering media callback during cleanup: " + e.getMessage(), e);
            }
            activeMediaController = null;
        }
        currentTrackId = ""; // Reset track ID
        currentPackageName = ""; // Reset package name
    }
}