function loadMapping() {
  var raw = PropertiesService.getScriptProperties().getProperty(CONFIG_KEYS.MAPPING_JSON);
  if (!raw) {
    return {};
  }

  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    Logger.log('[WARN] Invalid mapping JSON in Script Properties. Resetting in-memory mapping. Error=' + error.message);
    return {};
  }
}

function saveMapping(mapping) {
  PropertiesService.getScriptProperties().setProperty(CONFIG_KEYS.MAPPING_JSON, JSON.stringify(mapping || {}));
}

function buildMappingEntry_(issue, repo, taskId) {
  return {
    todoistTaskId: taskId || null,
    issueId: issue.id,
    issueNumber: issue.number,
    repo: repo,
    lastKnownUpdatedAt: issue.updated_at
  };
}
