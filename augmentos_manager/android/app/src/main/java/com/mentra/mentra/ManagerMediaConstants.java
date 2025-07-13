package com.augmentos.augmentos;

public final class ManagerMediaConstants {
    private ManagerMediaConstants() {}

    public static final String NATIVE_TO_JS_SOURCE_PHONE_MEDIA_UPDATE = "media_control_update";

    public static final String MEDIA_ACTION_PLAY = "PLAY"; // Or "play" if MediaControlManager expects lowercase
    public static final String MEDIA_ACTION_PAUSE = "PAUSE"; // Or "pause"
    public static final String MEDIA_ACTION_NEXT = "NEXT";   // Or "next"
    public static final String MEDIA_ACTION_PREVIOUS = "PREVIOUS"; // Or "previous"
    public static final String MEDIA_ACTION_SEEK = "SEEK";       // Or "seek"

    public static final String MEDIA_EVENT_STATE_CHANGED = "media_state";
    public static final String MEDIA_EVENT_METADATA_CHANGED = "media_metadata";
    public static final String MEDIA_EVENT_SESSION_ENDED = "media_session_ended";
}