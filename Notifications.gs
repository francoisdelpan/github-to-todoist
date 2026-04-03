function notifyDiscordIfNeeded_(config, stats) {
  if (!config.discordEnabled) {
    return;
  }

  if (!config.discordWebhookUrl) {
    Logger.log('[WARN] Discord notifications enabled but DISCORD_WEBHOOK_URL is missing.');
    return;
  }

  if (config.dryRun && !config.discordNotifyOnDryRun) {
    return;
  }

  var totalChanges = getTotalChanges_(stats);
  if (totalChanges === 0) {
    return;
  }

  try {
    sendDiscordWebhook_(config, buildDiscordPayload_(config, stats, totalChanges));
    logInfo_(config, 'Discord notification sent for ' + totalChanges + ' change(s).');
  } catch (error) {
    Logger.log('[ERROR] Discord notification failed: ' + error.message);
  }
}

function sendDiscordWebhook_(config, payload) {
  var response = UrlFetchApp.fetch(config.discordWebhookUrl, {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });

  assertHttpSuccess_(response, 'Discord', config.discordWebhookUrl);
}

function buildDiscordPayload_(config, stats, totalChanges) {
  var repos = config.githubRepos.join(', ');
  var summary = totalChanges + ' modification' + (totalChanges > 1 ? 's' : '');
  var details = [
    stats.created + ' created',
    stats.updated + ' updated',
    stats.completed + ' completed',
    stats.deleted + ' deleted'
  ].join(' | ');

  return {
    username: config.discordUsername,
    embeds: [
      {
        title: 'GitHub -> Todoist sync',
        description: summary,
        color: 5814783,
        fields: [
          { name: 'Repos', value: repos || '-', inline: false },
          { name: 'Details', value: details, inline: false },
          { name: 'Mode', value: config.dryRun ? 'dry-run' : 'live', inline: true },
          { name: 'Errors', value: String(stats.errors || 0), inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'GitHub to Todoist'
        }
      }
    ]
  };
}
