package com.augmentos.augmentos_manager;

public class MediaUpdateEvent {
    public final String eventName;
    public final String jsonData; // Should be a JSON string representing MediaState, MediaMetadata, etc.

    public MediaUpdateEvent(String eventName, String jsonData) {
        this.eventName = eventName;
        this.jsonData = jsonData;
    }

    @Override
    public String toString() {
        return "MediaUpdateEvent[Type: " + eventName + ", Data: " + (jsonData != null && jsonData.length() > 50 ? jsonData.substring(0, 50) + "..." : jsonData) + "]";
    }
}