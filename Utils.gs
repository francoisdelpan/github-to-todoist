function buildGithubIssueKey_(owner, repo, issueNumber) {
  return owner + '/' + repo + '#' + issueNumber;
}

function assertHttpSuccess_(response, serviceName, url) {
  var code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    return;
  }

  var body = truncateText_(response.getContentText() || '', 1000);
  throw new Error(serviceName + ' HTTP ' + code + ' for ' + url + ' | body=' + body);
}

function parseJsonResponse_(response, context) {
  var text = response.getContentText();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Failed to parse JSON for ' + context + ': ' + error.message + ' | body=' + truncateText_(text, 500));
  }
}

function normalizeLabels_(labels) {
  return (labels || []).map(function(label) {
    return String(label || '').trim().toLowerCase();
  }).filter(Boolean);
}

function hasAnyLabel_(labels, candidates) {
  for (var i = 0; i < candidates.length; i += 1) {
    if (labels.indexOf(candidates[i]) !== -1) {
      return true;
    }
  }
  return false;
}

function sanitizeLineBreaks_(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function truncateText_(text, maxLength) {
  var value = String(text || '');
  if (value.length <= maxLength) {
    return value;
  }
  return value.substring(0, maxLength) + '...';
}

function logInfo_(config, message) {
  if (config && config.logVerbose) {
    Logger.log('[INFO] ' + message);
  }
}

function createStats_() {
  return {
    created: 0,
    updated: 0,
    unchanged: 0,
    completed: 0,
    deleted: 0,
    skippedPullRequests: 0,
    skippedExcluded: 0,
    errors: 0
  };
}

function getTotalChanges_(stats) {
  return Number(stats.created || 0) +
    Number(stats.updated || 0) +
    Number(stats.completed || 0) +
    Number(stats.deleted || 0);
}
