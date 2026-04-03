function fetchGithubIssues(config, repo) {
  var allIssues = [];
  var page = 1;

  while (true) {
    var url = APP_DEFAULTS.GITHUB_BASE_URL +
      '/repos/' + encodeURIComponent(config.githubOwner) + '/' + encodeURIComponent(repo) +
      '/issues?state=open&per_page=' + APP_DEFAULTS.GITHUB_PER_PAGE +
      '&page=' + page + '&sort=updated&direction=desc';

    var response = githubRequest_(config, 'get', url);
    var items = parseJsonResponse_(response, 'GitHub issues list for ' + repo);

    if (!Array.isArray(items)) {
      throw new Error('Unexpected GitHub response for repo ' + repo + '. Expected an array.');
    }

    allIssues = allIssues.concat(items);

    if (items.length < APP_DEFAULTS.GITHUB_PER_PAGE) {
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
      Authorization: 'Bearer ' + config.githubToken,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': APP_DEFAULTS.GITHUB_API_VERSION
    }
  };

  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(url, options);
  assertHttpSuccess_(response, 'GitHub', url);
  return response;
}
