import {
  MediaState,
  MediaMetadata,
  MediaSessionEnded,
} from '../../../augmentos_cloud/packages/sdk/src/types'; 
import { CloudToCoreMessageTypes, MediaActionCommandValue, NativeToJsMessageSources, PhoneMediaEventNameValue } from '../types/message-types'

/**
 * Media event coming from native layer _manager (Java) to the JS layer _manager (CoreCommunicator.tsx) 
 */
export interface NativeMediaEventData {
  source: typeof NativeToJsMessageSources.PHONE_MEDIA_UPDATE;
  eventName: PhoneMediaEventNameValue;
  data: MediaState | MediaMetadata | MediaSessionEnded;
}

/**
 * Media control command sent from _cloud to _core
 */
export interface CloudSentMediaCommand {
    type: typeof CloudToCoreMessageTypes.PHONE_MEDIA_CONTROL; // This is the 'type' field set by your AugmentOS Cloud Server when sending to _core's ServerComms
    action: MediaActionCommandValue;
    value?: number; // For seek. JS will send seconds to native module, which expects seconds.
}

