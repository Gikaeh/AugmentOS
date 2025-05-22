package com.augmentos.augmentos_core;

public class Constants {
    public static String appName = "Augment OS";
    public static int augmentOsSdkVerion = 1;
    public static int augmentOsMainServiceNotificationId = 3588;
    public static int augmentOsPackageMonitorServiceNotificationId = 3587;
    public static String glassesCardTitle = "";
    public static String displayRequestsKey = "display_requests";
    public static String proactiveAgentResultsKey = "results_proactive_agent_insights";
    public static String explicitAgentQueriesKey = "explicit_insight_queries";
    public static String explicitAgentResultsKey = "explicit_insight_results";
    public static String wakeWordTimeKey = "wake_word_time";
    public static String entityDefinitionsKey = "entity_definitions";
    public static String languageLearningKey = "language_learning_results";
    public static String llContextConvoKey = "ll_context_convo_results";
    public static String llWordSuggestUpgradeKey = "ll_word_suggest_upgrade_results";
    public static String shouldUpdateSettingsKey = "should_update_settings";
    public static String adhdStmbAgentKey = "adhd_stmb_agent_results";
    public static String notificationFilterKey = "notification_results";
    public static String newsSummaryKey = "news_summary_results";

    //endpoints
    public static final String LLM_QUERY_ENDPOINT = "/chat";
    public static final String SEND_NOTIFICATIONS_ENDPOINT = "/send_notifications";
    public static final String DIARIZE_QUERY_ENDPOINT = "/chat_diarization";
    public static final String GEOLOCATION_STREAM_ENDPOINT = "/gps_location";
    public static final String BUTTON_EVENT_ENDPOINT = "/button_event";
    public static final String UI_POLL_ENDPOINT = "/ui_poll";
    public static final String SET_USER_SETTINGS_ENDPOINT = "/set_user_settings";
    public static final String GET_USER_SETTINGS_ENDPOINT = "/get_user_settings";
    public static final String REQUEST_APP_BY_PACKAGE_NAME_DOWNLOAD_LINK_ENDPOINT = "/request_app_by_package_name_download_link";

    //media
    // 'command' field for messages received by _core from _manager (JS)
    public static final String MANAGER_TO_CORE_MEDIA_STATE = "core_send_media_state";
    public static final String MANAGER_TO_CORE_MEDIA_METADATA = "core_send_media_metadata";
    public static final String MANAGER_TO_CORE_MEDIA_SESSION__ENDED = "core_send_media_session_ended";
    // 'source' field for messages _core sends to _manager (JS)
    public static final String CORE_TO_MANAGER_CLOUD_SENT_COMMAND = "cloud_sent_media_command";
    // 'type' field for messages _core receives from AugmentOS Cloud
    public static final String CLOUD_TO_CORE_TYPE_PHONE_MEDIA_CTRL = "phone_media_control";
    // 'type' field for messages _core sends to _cloud
    public static final String CORE_TO_CLOUD_STATE_UPDATE = "media_state_update";
    public static final String CORE_TO_CLOUD_METADATA_UPDATE = "media_metadata_update";
    public static final String CORE_TO_CLOUD_SESSION_ENDED_UPDATE = "media_session_ended_update";
}
