import { EventManager } from "./events";
import {
    // Message types
    TpaToCloudMessageType,

    // Media data types
    MediaControlCommand,
    MediaState,
    MediaMetadata,
    MediaSessionEnded,
} from '../../types'

export type MediaEventHandler<T> = (data: T) => void;

export class MediaControls {
    constructor(
        private eventManager: EventManager,
        private sendCommandToCloud: (command: MediaControlCommand) => void
    ) {}

    /**
   * Listens for when a media state is changed.
   * @param handler Function to call when the session ends.
   * @returns A function to call to unsubscribe the handler.
   */
    onStateChanged(handler: MediaEventHandler<MediaState>): () => void {
        return this.eventManager.onMediaStateChanged(handler);
    }

    /**
   * Listens for when a media metadata is changed.
   * @param handler Function to call when the session ends.
   * @returns A function to call to unsubscribe the handler.
   */
    onMetadataChanged(handler: MediaEventHandler<MediaMetadata>): () => void {
        return this.eventManager.onMediaMetadataChanged(handler);
    }

    /**
   * Listens for when a phone media session ends or no active session is found.
   * @param handler Function to call when the session ends.
   * @returns A function to call to unsubscribe the handler.
   */
    onSessionEnded(handler: MediaEventHandler<MediaSessionEnded>): () => void {
        return this.eventManager.onMediaSessionEnded(handler);
    }

    play(): void {
        this.sendCommandToCloud({
            type: TpaToCloudMessageType.PHONE_MEDIA_CONTROL,
            action: 'play',
            timestamp: new Date()
        });
    }

    pause(): void {
        this.sendCommandToCloud({
            type: TpaToCloudMessageType.PHONE_MEDIA_CONTROL,
            action: 'pause',
            timestamp: new Date()
        });
    }

    skipToNext(): void {
        this.sendCommandToCloud({
            type: TpaToCloudMessageType.PHONE_MEDIA_CONTROL,
            action: 'next',
            timestamp: new Date()
        });
    }

    skipToPrevious(): void {
        this.sendCommandToCloud({
            type: TpaToCloudMessageType.PHONE_MEDIA_CONTROL,
            action: 'previous',
            timestamp: new Date()
        });
    }

    seekTo(positionSeconds: number): void {
        this.sendCommandToCloud({
            type: TpaToCloudMessageType.PHONE_MEDIA_CONTROL,
            action: "seek",
            value: positionSeconds,
            timestamp: new Date()
        })
    }
}