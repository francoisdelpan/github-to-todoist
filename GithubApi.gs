function fetchGithubIssues(config, repo) {
  var allIssues = [];
  var page = 1;

  while (true) {
    var url = config.issueBaseUrl +
      '/repos/' + encodeURIComponent(config.githubOwner) + '/' + encodeURIComponent(repo) +
      '/issues?state=open&type=issues&limit=' + APP_DEFAULTS.ISSUE_PAGE_LIMIT +
      '&page=' + page;

    var response = githubRequest_(config, 'get', url);
    var items = parseJsonResponse_(response, 'Gitea issues list for ' + repo);

    if (!Array.isArray(items)) {
      throw new Error('Unexpected Gitea response for repo ' + repo + '. Expected an array.');
    }

    allIssues = allIssues.concat(items);

    if (items.length < APP_DEFAULTS.ISSUE_PAGE_LIMIT) {
      break;
    }

    page += 1;
  }

  return allIssues;
}

function isPullRequest(issue) {
  return !!(issue && issue.pull_request);
}

function shouldExcludeIssue(issue, config) {
  var excluded = normalizeLabels_(config.excludedLabels);
  if (excluded.length === 0) {
    return false;
  }

  var issueLabels = normalizeLabels_((issue.labels || []).map(function(label) {
    return typeof label === 'string' ? label : label.name;
  }));

  for (var i = 0; i < issueLabels.length; i += 1) {
    if (excluded.indexOf(issueLabels[i]) !== -1) {
      return true;
    }
  }

  return false;
}

function githubRequest_(config, method, url, payload) {
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'token ' + config.githubToken,
      Accept: 'application/json'
    }
  };

  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(url, options);
  assertHttpSuccess_(response, 'Gitea', url);
  return response;
}
