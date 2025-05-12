package com.augmentos.augmentos_manager;

public class MediaControlEvent {
    // Define action constants for clarity and type safety
    public static final String ACTION_PLAY = "PLAY";
    public static final String ACTION_PAUSE = "PAUSE";
    public static final String ACTION_NEXT = "NEXT";
    public static final String ACTION_PREVIOUS = "PREVIOUS";
    public static final String ACTION_SHUFFLE = "SHUFFLE";
    public static final String ACTION_REPEAT = "REPEAT";
    public static final String ACTION_SEEK = "SEEK";

    public final String action;
    public final long value = -1; // For SEEK, value is in milliseconds. For other actions, can be -1 or ignored.

    public MediaControlEvent(String action) {
        this.action = action;
    }

    public MediaControlEvent(String action, long value) {
        this.action = action;
        this.value = value;
    }
}