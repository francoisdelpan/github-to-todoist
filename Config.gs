var APP_DEFAULTS = {
  EXCLUDED_LABELS: [],
  CLOSE_BEHAVIOR: 'complete',
  DRY_RUN: true,
  LOG_VERBOSE: true,
  DISCORD_ENABLED: false,
  DISCORD_USERNAME: 'Gitea Todoist Sync',
  DISCORD_NOTIFY_ON_DRY_RUN: false,
  DISCORD_NOTIFY_ON_UPDATES: false,
  ENABLE_DUE_DATE_SYNC: false,
  DUE_DATE_LABEL_PREFIX: 'due:',
  ISSUE_PAGE_LIMIT: 100,
  TODOIST_PAGE_LIMIT: 200,
  TODOIST_BASE_URL: 'https://api.todoist.com/api/v1',
  GITHUB_BASE_URL: 'https://api.github.com',
  GITEA_BASE_URL: 'https://git.utema.fr/api/v1'
};

var CONFIG_KEYS = {
  GITHUB_TOKEN: 'GITHUB_TOKEN',
  TODOIST_TOKEN: 'TODOIST_TOKEN',
  TODOIST_PROJECT_ID: 'TODOIST_PROJECT_ID',
  GITHUB_OWNER: 'GITHUB_OWNER',
  GITHUB_REPOS: 'GITHUB_REPOS',
  GITHUB_BASE_URL: 'GITHUB_BASE_URL',
  GITEA_BASE_URL: 'GITEA_BASE_URL',
  EXCLUDED_LABELS: 'EXCLUDED_LABELS',
  CLOSE_BEHAVIOR: 'CLOSE_BEHAVIOR',
  DRY_RUN: 'DRY_RUN',
  LOG_VERBOSE: 'LOG_VERBOSE',
  DISCORD_ENABLED: 'DISCORD_ENABLED',
  DISCORD_WEBHOOK_URL: 'DISCORD_WEBHOOK_URL',
  DISCORD_USERNAME: 'DISCORD_USERNAME',
  DISCORD_NOTIFY_ON_DRY_RUN: 'DISCORD_NOTIFY_ON_DRY_RUN',
  DISCORD_NOTIFY_ON_UPDATES: 'DISCORD_NOTIFY_ON_UPDATES',
  ENABLE_DUE_DATE_SYNC: 'ENABLE_DUE_DATE_SYNC',
  DUE_DATE_LABEL_PREFIX: 'DUE_DATE_LABEL_PREFIX',
  MAPPING_JSON: 'ISSUE_TASK_MAPPING_JSON',
  LAST_SYNC_AT: 'LAST_SYNC_AT'
};

function ensureConfig() {
  var properties = PropertiesService.getScriptProperties();

  var config = {
    githubToken: requireProperty_(properties, CONFIG_KEYS.GITHUB_TOKEN),
    todoistToken: requireProperty_(properties, CONFIG_KEYS.TODOIST_TOKEN),
    todoistProjectId: requireProperty_(properties, CONFIG_KEYS.TODOIST_PROJECT_ID),
    githubOwner: requireProperty_(properties, CONFIG_KEYS.GITHUB_OWNER),
    githubRepos: getArrayPropertyOrDefault_(properties, CONFIG_KEYS.GITHUB_REPOS, []),
    issueBaseUrl: getIssueBaseUrl_(properties),
    excludedLabels: getArrayPropertyOrDefault_(properties, CONFIG_KEYS.EXCLUDED_LABELS, APP_DEFAULTS.EXCLUDED_LABELS),
    closeBehavior: getPropertyOrDefault_(properties, CONFIG_KEYS.CLOSE_BEHAVIOR, APP_DEFAULTS.CLOSE_BEHAVIOR).toLowerCase(),
    dryRun: getBooleanPropertyOrDefault_(properties, CONFIG_KEYS.DRY_RUN, APP_DEFAULTS.DRY_RUN),
    logVerbose: getBooleanPropertyOrDefault_(properties, CONFIG_KEYS.LOG_VERBOSE, APP_DEFAULTS.LOG_VERBOSE),
    discordEnabled: getBooleanPropertyOrDefault_(properties, CONFIG_KEYS.DISCORD_ENABLED, APP_DEFAULTS.DISCORD_ENABLED),
    discordWebhookUrl: getPropertyOrDefault_(properties, CONFIG_KEYS.DISCORD_WEBHOOK_URL, ''),
    discordUsername: getPropertyOrDefault_(properties, CONFIG_KEYS.DISCORD_USERNAME, APP_DEFAULTS.DISCORD_USERNAME),
    discordNotifyOnDryRun: getBooleanPropertyOrDefault_(properties, CONFIG_KEYS.DISCORD_NOTIFY_ON_DRY_RUN, APP_DEFAULTS.DISCORD_NOTIFY_ON_DRY_RUN),
    discordNotifyOnUpdates: getBooleanPropertyOrDefault_(properties, CONFIG_KEYS.DISCORD_NOTIFY_ON_UPDATES, APP_DEFAULTS.DISCORD_NOTIFY_ON_UPDATES),
    enableDueDateSync: getBooleanPropertyOrDefault_(properties, CONFIG_KEYS.ENABLE_DUE_DATE_SYNC, APP_DEFAULTS.ENABLE_DUE_DATE_SYNC),
    dueDateLabelPrefix: getPropertyOrDefault_(properties, CONFIG_KEYS.DUE_DATE_LABEL_PREFIX, APP_DEFAULTS.DUE_DATE_LABEL_PREFIX)
  };

  if (!config.githubRepos.length) {
    throw new Error('Missing GITHUB_REPOS. Example: ["repo-a","repo-b"]');
  }

  if (['complete', 'delete', 'ignore'].indexOf(config.closeBehavior) === -1) {
    throw new Error('Invalid CLOSE_BEHAVIOR: ' + config.closeBehavior);
  }

  return config;
}

function requireProperty_(properties, key) {
  var value = properties.getProperty(key);
  if (!value) {
    throw new Error('Missing required Script Property: ' + key);
  }
  return value;
}

function getPropertyOrDefault_(properties, key, defaultValue) {
  var value = properties.getProperty(key);
  return value === null || value === '' ? defaultValue : value;
}

function getArrayPropertyOrDefault_(properties, key, defaultValue) {
  var raw = properties.getProperty(key);
  if (raw === null || raw === '') {
    return Array.isArray(defaultValue) ? defaultValue.slice() : [];
  }

  try {
    var parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(Boolean);
    }
  } catch (error) {
    // Fall back to comma-separated values.
  }

  return String(raw).split(',').map(function(part) {
    return part.trim();
  }).filter(Boolean);
}

function getBooleanPropertyOrDefault_(properties, key, defaultValue) {
  var raw = properties.getProperty(key);
  if (raw === null || raw === '') {
    return !!defaultValue;
  }

  return String(raw).toLowerCase() === 'true';
}

function getIssueBaseUrl_(properties) {
  var raw = getPropertyOrDefault_(
    properties,
    CONFIG_KEYS.GITEA_BASE_URL,
    getPropertyOrDefault_(properties, CONFIG_KEYS.GITHUB_BASE_URL, APP_DEFAULTS.GITEA_BASE_URL)
  );

  var normalized = String(raw || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    return APP_DEFAULTS.GITEA_BASE_URL;
  }

  if (/\/api\/v1$/i.test(normalized)) {
    return normalized;
  }

  return normalized + '/api/v1';
}
