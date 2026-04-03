function syncGithubIssuesToTodoist() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('[WARN] Another sync is already running. Skipping this execution.');
    return;
  }

  try {
    var config = ensureConfig();
    logInfo_(config, 'Starting sync. dryRun=' + config.dryRun + ', repos=' + config.githubRepos.join(', '));

    var mapping = loadMapping();
    var todoistTasks = fetchTodoistTasksForProject(config);
    var todoistIndex = indexTodoistTasksById_(todoistTasks);
    var todoistIndexByGithubKey = indexTodoistTasksByGithubKey_(todoistTasks);

    var activeGithubKeys = {};
    var reposFetchedSuccessfully = {};
    var stats = createStats_();

    for (var i = 0; i < config.githubRepos.length; i += 1) {
      var repo = config.githubRepos[i];

      try {
        var issues = fetchGithubIssues(config, repo);
        reposFetchedSuccessfully[repo] = true;
        logInfo_(config, 'Repo ' + repo + ': fetched ' + issues.length + ' open issues from GitHub.');

        for (var j = 0; j < issues.length; j += 1) {
          var issue = issues[j];

          try {
            if (isPullRequest(issue)) {
              stats.skippedPullRequests += 1;
              continue;
            }

            if (shouldExcludeIssue(issue, config)) {
              stats.skippedExcluded += 1;
              continue;
            }

            upsertIssueToTodoist_(
              config,
              repo,
              issue,
              mapping,
              todoistIndex,
              todoistIndexByGithubKey,
              activeGithubKeys,
              stats
            );
          } catch (issueError) {
            stats.errors += 1;
            Logger.log('[ERROR] Issue processing failed for ' + buildGithubIssueKey_(config.githubOwner, repo, issue.number) + ': ' + issueError.message);
          }
        }
      } catch (repoError) {
        stats.errors += 1;
        Logger.log('[ERROR] Repo sync failed for ' + repo + ': ' + repoError.message);
      }
    }

    reconcileInactiveMappedIssues_(config, mapping, todoistIndex, activeGithubKeys, reposFetchedSuccessfully, stats);

    if (!config.dryRun) {
      saveMapping(mapping);
      PropertiesService.getScriptProperties().setProperty(CONFIG_KEYS.LAST_SYNC_AT, new Date().toISOString());
    } else {
      logInfo_(config, 'Dry-run enabled. Mapping and Todoist were not modified.');
    }

    Logger.log('[INFO] Sync completed. ' + JSON.stringify(stats));
  } finally {
    lock.releaseLock();
  }
}

function installTriggerEvery15Min() {
  deleteExistingSyncTriggers_();
  ScriptApp.newTrigger('syncGithubIssuesToTodoist')
    .timeBased()
    .everyMinutes(15)
    .create();
  Logger.log('[INFO] Trigger installed: syncGithubIssuesToTodoist every 15 minutes.');
}

function testSyncDryRun() {
  var properties = PropertiesService.getScriptProperties();
  var previous = properties.getProperty(CONFIG_KEYS.DRY_RUN);

  properties.setProperty(CONFIG_KEYS.DRY_RUN, 'true');
  try {
    syncGithubIssuesToTodoist();
  } finally {
    if (previous === null) {
      properties.deleteProperty(CONFIG_KEYS.DRY_RUN);
    } else {
      properties.setProperty(CONFIG_KEYS.DRY_RUN, previous);
    }
  }
}

function setupScriptProperties() {
  PropertiesService.getScriptProperties().setProperties({
    GITHUB_TOKEN: 'REPLACE_WITH_GITHUB_TOKEN',
    TODOIST_TOKEN: 'REPLACE_WITH_TODOIST_TOKEN',
    TODOIST_PROJECT_ID: 'REPLACE_WITH_TODOIST_PROJECT_ID',
    GITHUB_OWNER: 'REPLACE_WITH_GITHUB_OWNER',
    GITHUB_REPOS: '["repo-a","repo-b"]',
    EXCLUDED_LABELS: '[]',
    CLOSE_BEHAVIOR: 'complete',
    DRY_RUN: 'true',
    LOG_VERBOSE: 'true',
    ENABLE_DUE_DATE_SYNC: 'false',
    DUE_DATE_LABEL_PREFIX: 'due:'
  }, false);

  Logger.log('[INFO] Script Properties placeholders created. Replace them before running the sync.');
}

function resetStoredMapping() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG_KEYS.MAPPING_JSON);
  Logger.log('[INFO] Mapping reset.');
}

function deleteExistingSyncTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i += 1) {
    if (triggers[i].getHandlerFunction() === 'syncGithubIssuesToTodoist') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function upsertIssueToTodoist_(config, repo, issue, mapping, todoistIndex, todoistIndexByGithubKey, activeGithubKeys, stats) {
  var githubKey = buildGithubIssueKey_(config.githubOwner, repo, issue.number);
  activeGithubKeys[githubKey] = true;

  var payload = buildTodoistTaskPayload(issue, repo, config);
  var mappedEntry = mapping[githubKey];
  var mappedTask = mappedEntry ? todoistIndex[mappedEntry.todoistTaskId] : null;
  var relinkedTask = todoistIndexByGithubKey[githubKey] || null;
  var currentTask = mappedTask || relinkedTask || null;

  if (!mappedTask && relinkedTask) {
    logInfo_(config, 'Recovered mapping from Todoist task description for ' + githubKey + ' -> ' + relinkedTask.id);
  }

  if (!currentTask) {
    var createdTask = createTodoistTask(config, payload);
    var createdTaskId = createdTask && createdTask.id ? String(createdTask.id) : null;

    mapping[githubKey] = buildMappingEntry_(issue, repo, createdTaskId);
    if (createdTaskId) {
      todoistIndex[createdTaskId] = createdTask;
    }

    stats.created += 1;
    return;
  }

  var taskId = String(currentTask.id);
  mapping[githubKey] = buildMappingEntry_(issue, repo, taskId);

  if (shouldUpdateTodoistTask_(currentTask, payload)) {
    updateTodoistTask(config, taskId, payload);
    stats.updated += 1;
  } else {
    stats.unchanged += 1;
  }
}

function reconcileInactiveMappedIssues_(config, mapping, todoistIndex, activeGithubKeys, reposFetchedSuccessfully, stats) {
  var keys = Object.keys(mapping);

  for (var i = 0; i < keys.length; i += 1) {
    var githubKey = keys[i];
    var entry = mapping[githubKey];

    if (!entry || !entry.repo || !reposFetchedSuccessfully[entry.repo]) {
      continue;
    }

    if (activeGithubKeys[githubKey]) {
      continue;
    }

    var taskId = entry.todoistTaskId;
    var taskExists = taskId && !!todoistIndex[taskId];

    if (config.closeBehavior === 'ignore') {
      logInfo_(config, 'Ignoring inactive issue ' + githubKey + ' because CLOSE_BEHAVIOR=ignore.');
      continue;
    }

    if (taskExists) {
      if (config.closeBehavior === 'complete') {
        completeTodoistTask(config, taskId);
        stats.completed += 1;
      } else if (config.closeBehavior === 'delete') {
        deleteTodoistTask(config, taskId);
        stats.deleted += 1;
      }
    } else {
      logInfo_(config, 'Mapped task missing for inactive issue ' + githubKey + '. Removing mapping only.');
    }

    delete mapping[githubKey];
  }
}
