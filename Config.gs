var APP_DEFAULTS = {
  EXCLUDED_LABELS: [],
  CLOSE_BEHAVIOR: 'complete',
  DRY_RUN: true,
  LOG_VERBOSE: true,
  ENABLE_DUE_DATE_SYNC: false,
  DUE_DATE_LABEL_PREFIX: 'due:',
  GITHUB_PER_PAGE: 100,
  TODOIST_PAGE_LIMIT: 200,
  TODOIST_BASE_URL: 'https://api.todoist.com/api/v1',
  GITHUB_BASE_URL: 'https://api.github.com',
  GITHUB_API_VERSION: '2022-11-28'
};

var CONFIG_KEYS = {
  GITHUB_TOKEN: 'GITHUB_TOKEN',
  TODOIST_TOKEN: 'TODOIST_TOKEN',
  TODOIST_PROJECT_ID: 'TODOIST_PROJECT_ID',
  GITHUB_OWNER: 'GITHUB_OWNER',
  GITHUB_REPOS: 'GITHUB_REPOS',
  EXCLUDED_LABELS: 'EXCLUDED_LABELS',
  CLOSE_BEHAVIOR: 'CLOSE_BEHAVIOR',
  DRY_RUN: 'DRY_RUN',
  LOG_VERBOSE: 'LOG_VERBOSE',
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
    excludedLabels: getArrayPropertyOrDefault_(properties, CONFIG_KEYS.EXCLUDED_LABELS, APP_DEFAULTS.EXCLUDED_LABELS),
    closeBehavior: getPropertyOrDefault_(properties, CONFIG_KEYS.CLOSE_BEHAVIOR, APP_DEFAULTS.CLOSE_BEHAVIOR).toLowerCase(),
    dryRun: getBooleanPropertyOrDefault_(properties, CONFIG_KEYS.DRY_RUN, APP_DEFAULTS.DRY_RUN),
    logVerbose: getBooleanPropertyOrDefault_(properties, CONFIG_KEYS.LOG_VERBOSE, APP_DEFAULTS.LOG_VERBOSE),
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
