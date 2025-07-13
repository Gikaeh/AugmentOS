package com.augmentos.augmentos;

public class MediaControlEvent {
    public final String action;
    public final long value; // For SEEK, value is in milliseconds. For other actions, can be -1 or ignored.

    public MediaControlEvent(String action) {
        this.action = action;
        this.value = -1;
    }

    public MediaControlEvent(String action, long value) {
        this.action = action;
        this.value = value;
    }
}