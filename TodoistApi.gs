function fetchTodoistTasksForProject(config) {
  var allTasks = [];
  var cursor = null;

  while (true) {
    var url = APP_DEFAULTS.TODOIST_BASE_URL +
      '/tasks?project_id=' + encodeURIComponent(config.todoistProjectId) +
      '&limit=' + APP_DEFAULTS.TODOIST_PAGE_LIMIT;

    if (cursor) {
      url += '&cursor=' + encodeURIComponent(cursor);
    }

    var response = todoistRequest_(config, 'get', url);
    var payload = parseJsonResponse_(response, 'Todoist task list');
    var tasks = Array.isArray(payload) ? payload : payload.results;

    if (!Array.isArray(tasks)) {
      throw new Error('Unexpected Todoist tasks response. Expected array or {results, next_cursor}.');
    }

    allTasks = allTasks.concat(tasks);
    cursor = payload && payload.next_cursor ? payload.next_cursor : null;

    if (!cursor) {
      break;
    }
  }

  logInfo_(config, 'Fetched ' + allTasks.length + ' active Todoist tasks from project ' + config.todoistProjectId + '.');
  return allTasks;
}

function buildTodoistTaskPayload(issue, repo, config) {
  var labels = (issue.labels || []).map(function(label) {
    return typeof label === 'string' ? label : label.name;
  }).filter(Boolean);

  var assignees = (issue.assignees || []).map(function(assignee) {
    return assignee.login;
  }).filter(Boolean);

  var repoTag = buildTodoistRepoTag_(repo);
  var todoistLabels = [repoTag];
  var githubPriority = extractGithubPriority_(issue, labels);

  var payload = {
    project_id: config.todoistProjectId,
    content: issue.title,
    description: buildTodoistDescription_(issue, repo, labels, assignees, config),
    priority: getTodoistPriorityFromGithubPriority_(githubPriority, labels),
    labels: todoistLabels
  };

  var dueString = extractDueStringFromIssue_(issue, labels, config);
  if (dueString) {
    payload.due_string = dueString;
  }

  return payload;
}

function createTodoistTask(config, payload) {
  if (config.dryRun) {
    Logger.log('[DRY-RUN] Would create Todoist task: ' + payload.content);
    return { id: 'dry-run-create-' + new Date().getTime() };
  }

  var response = todoistRequest_(config, 'post', APP_DEFAULTS.TODOIST_BASE_URL + '/tasks', payload);
  return parseJsonResponse_(response, 'Todoist create task');
}

function updateTodoistTask(config, taskId, payload) {
  if (config.dryRun) {
    Logger.log('[DRY-RUN] Would update Todoist task ' + taskId + ': ' + payload.content);
    return;
  }

  todoistRequest_(config, 'post', APP_DEFAULTS.TODOIST_BASE_URL + '/tasks/' + encodeURIComponent(taskId), payload);
}

function completeTodoistTask(config, taskId) {
  if (config.dryRun) {
    Logger.log('[DRY-RUN] Would complete Todoist task ' + taskId);
    return;
  }

  todoistRequest_(config, 'post', APP_DEFAULTS.TODOIST_BASE_URL + '/tasks/' + encodeURIComponent(taskId) + '/close');
}

function deleteTodoistTask(config, taskId) {
  if (config.dryRun) {
    Logger.log('[DRY-RUN] Would delete Todoist task ' + taskId);
    return;
  }

  todoistRequest_(config, 'delete', APP_DEFAULTS.TODOIST_BASE_URL + '/tasks/' + encodeURIComponent(taskId));
}

function todoistRequest_(config, method, url, payload) {
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + config.todoistToken
    }
  };

  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(url, options);
  assertHttpSuccess_(response, 'Todoist', url);
  return response;
}

function getTodoistPriorityFromGithubPriority_(githubPriority, labels) {
  var normalizedPriority = normalizeGithubPriorityValue_(githubPriority);

  if (normalizedPriority === 'top' || normalizedPriority === 'p1') {
    return 4;
  }
  if (normalizedPriority === 'p2') {
    return 3;
  }
  if (normalizedPriority === 'p3') {
    return 2;
  }
  if (normalizedPriority === 'p4') {
    return 1;
  }

  return getPriorityFromLabels_(labels);
}

function getPriorityFromLabels_(labels) {
  var normalized = normalizeLabels_(labels);

  if (hasAnyLabel_(normalized, ['p1', 'priority:p1', 'priority-1', 'sev:1', 'severity:1'])) {
    return 4;
  }
  if (hasAnyLabel_(normalized, ['p2', 'priority:p2', 'priority-2', 'sev:2', 'severity:2'])) {
    return 3;
  }
  if (hasAnyLabel_(normalized, ['p3', 'priority:p3', 'priority-3', 'sev:3', 'severity:3'])) {
    return 2;
  }

  return 1;
}

function buildTodoistDescription_(issue, repo, labels, assignees, config) {
  var githubPriority = extractGithubPriority_(issue, labels);

  var lines = [
    'GitHub URL: ' + (issue.html_url || ''),
    'GitHub Key: ' + buildGithubIssueKey_(config.githubOwner, repo, issue.number),
    'Issue Number: #' + issue.number,
    'Repo: ' + config.githubOwner + '/' + repo,
    'State: ' + issue.state,
    'Priority: ' + (githubPriority || '-'),
    'Labels: ' + (labels.length ? labels.join(', ') : '-'),
    'Assignees: ' + (assignees.length ? assignees.join(', ') : '-'),
    'Created At: ' + (issue.created_at || '-'),
    'Updated At: ' + (issue.updated_at || '-')
  ];

  if (issue.body) {
    lines.push('');
    lines.push('Issue Body:');
    lines.push(truncateText_(sanitizeLineBreaks_(issue.body), 1200));
  }

  return lines.join('\n');
}

function extractDueStringFromIssue_(issue, labels, config) {
  if (!config.enableDueDateSync) {
    return null;
  }

  var prefix = (config.dueDateLabelPrefix || '').toLowerCase();
  if (!prefix) {
    return null;
  }

  for (var i = 0; i < labels.length; i += 1) {
    var label = String(labels[i] || '');
    var normalized = label.toLowerCase();
    if (normalized.indexOf(prefix) !== 0) {
      continue;
    }

    var value = label.substring(prefix.length).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
  }

  return null;
}

function shouldUpdateTodoistTask_(task, payload) {
  var taskDueString = task && task.due && (task.due.string || task.due.date) ? String(task.due.string || task.due.date) : null;
  var payloadDueString = payload.due_string ? String(payload.due_string) : null;
  var currentLabels = normalizeLabels_(task && task.labels ? task.labels : []);
  var nextLabels = normalizeLabels_(payload.labels || []);

  return String(task.content || '') !== String(payload.content || '') ||
    String(task.description || '') !== String(payload.description || '') ||
    Number(task.priority || 1) !== Number(payload.priority || 1) ||
    currentLabels.join('|') !== nextLabels.join('|') ||
    String(taskDueString || '') !== String(payloadDueString || '');
}

function extractGithubPriority_(issue, labels) {
  if (issue && issue.priority) {
    if (typeof issue.priority === 'string') {
      return issue.priority;
    }
    if (issue.priority.name) {
      return issue.priority.name;
    }
    if (issue.priority.value) {
      return issue.priority.value;
    }
  }

  var normalizedLabels = normalizeLabels_(labels);
  if (hasAnyLabel_(normalizedLabels, ['top'])) {
    return 'TOP';
  }
  if (hasAnyLabel_(normalizedLabels, ['p1', 'priority:p1', 'priority-1'])) {
    return 'P1';
  }
  if (hasAnyLabel_(normalizedLabels, ['p2', 'priority:p2', 'priority-2'])) {
    return 'P2';
  }
  if (hasAnyLabel_(normalizedLabels, ['p3', 'priority:p3', 'priority-3'])) {
    return 'P3';
  }
  if (hasAnyLabel_(normalizedLabels, ['p4', 'priority:p4', 'priority-4'])) {
    return 'P4';
  }

  return null;
}

function normalizeGithubPriorityValue_(value) {
  return String(value || '').trim().toLowerCase();
}

function buildTodoistRepoTag_(repo) {
  return String(repo || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function indexTodoistTasksById_(tasks) {
  var index = {};
  for (var i = 0; i < tasks.length; i += 1) {
    if (tasks[i] && tasks[i].id) {
      index[String(tasks[i].id)] = tasks[i];
    }
  }
  return index;
}

function indexTodoistTasksByGithubKey_(tasks) {
  var index = {};
  for (var i = 0; i < tasks.length; i += 1) {
    var task = tasks[i];
    var githubKey = extractGithubKeyFromTaskDescription_(task);
    if (githubKey) {
      index[githubKey] = task;
    }
  }
  return index;
}

function extractGithubKeyFromTaskDescription_(task) {
  if (!task || !task.description) {
    return null;
  }

  var match = String(task.description).match(/GitHub Key:\s*([^\n\r]+)/i);
  return match ? match[1].trim() : null;
}
