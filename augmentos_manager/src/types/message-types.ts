/**
 * Commands sent from _manager to _core
 * Typically the command field in the JSON event via AugmentOSLib.sendDataFromManagerToCore()
 */
export const ManagerToCoreCommands = {
    SEND_SDK_DATA_TO_CLOUD: 'core_send_media_state',
} as const;

/**
 * source field values for messages coming from native Java Layer (_media or _core)
 * to _manager's JS layer (CoreCommunicator.android.tsx) via the CoreMessageEvent
 */
export const NativeToJsMessageSources = {
    PHONE_MEDIA_UPDATE: 'media_control_update',
    CLOUD_SENT_COMMAND: 'cloud_sent_media_command',
} as const;

/**
 * type field values for messages sent from the AugmentOS Cloud to _core's WebSocket.
 * _core might then relay these (or parts of them) to _manager's JS layer.
 */
export const CloudToCoreMessageTypes = {
    PHONE_MEDIA_CONTROL: 'phone_media_control',
} as const;

/**
 * Event names used within 'media_control' sourced messages from native,
 * indicating the type of media update.
 * SHOULD ALIGN WITH MediaControlManager.java
 */
export const PhoneMediaEventNames = {
    MEDIA_STATE_CHANGED: 'media_state',
    MEDIA_METADATA_CHANGED: 'media_metadata',
    MEDIA_SESSION_ENDED: 'media_session_ended',
} as const;

/**
 * Action strings for media control
 * Used in:
 *  - 'phone_media_control' messages from the cloud
 *  - Calls from CoreCommunicator.tsx to NotificationServiceUtils native methods
 *  - MediaControlEvent actions in java
 */
export const MediaActionCommands = {
    PLAY: 'play',
    PAUSE: 'pause',
    NEXT: 'next',
    PREVIOUS: 'previous',
    SEEK: 'seek',
}

export type ValueOf<T> = T[keyof T];

export type ManagerToCoreCommandValue = ValueOf<typeof ManagerToCoreCommands>;
export type NativeToJsMessageSourceValue = ValueOf<typeof NativeToJsMessageSources>;
export type CloudToCoreMessageTypeValue = ValueOf<typeof CloudToCoreMessageTypes>;
export type PhoneMediaEventNameValue = ValueOf<typeof PhoneMediaEventNames>;
export type MediaActionCommandValue = ValueOf<typeof MediaActionCommands>;