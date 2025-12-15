/**
 * /stats Command Handler
 *
 * Displays bot usage statistics for authorized users.
 * Uses KV-based counters for in-worker querying.
 *
 * Access is restricted to users listed in STATS_AUTHORIZED_USERS env var.
 */

import type { Env, DiscordInteraction } from '../../types/env.js';
import type { ExtendedLogger } from '@xivdyetools/logger';
import { getStats } from '../../services/analytics.js';
import { createUserTranslator } from '../../services/bot-i18n.js';

// Discord embed colors
const COLORS = {
  blurple: 0x5865f2,
  green: 0x57f287,
  red: 0xed4245,
} as const;

/**
 * Check if user is authorized to view stats
 */
function isAuthorized(env: Env, userId: string): boolean {
  if (!env.STATS_AUTHORIZED_USERS) {
    return false;
  }

  const authorizedUsers = env.STATS_AUTHORIZED_USERS.split(',').map((id) =>
    id.trim()
  );
  return authorizedUsers.includes(userId);
}

/**
 * Format uptime from worker start (approximation via headers)
 * Note: Workers are stateless, so we can't track true uptime.
 * Instead, we show the worker version/deployment info.
 */
function getWorkerInfo(): string {
  return 'Cloudflare Workers (Serverless)';
}

/**
 * Handles the /stats command
 */
export async function handleStatsCommand(
  interaction: DiscordInteraction,
  env: Env,
  _ctx: ExecutionContext,
  logger?: ExtendedLogger
): Promise<Response> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  const t = await createUserTranslator(env.KV, userId || 'unknown', interaction.locale);

  // Check authorization
  if (!userId || !isAuthorized(env, userId)) {
    return Response.json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [
          {
            title: '⛔ Access Denied',
            description: 'You do not have permission to view bot statistics.',
            color: COLORS.red,
          },
        ],
        flags: 64, // Ephemeral
      },
    });
  }

  try {
    // Get stats from KV
    const stats = await getStats(env.KV);

    // Get top 5 commands
    const topCommands = Object.entries(stats.commandBreakdown)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const topCommandsText =
      topCommands.length > 0
        ? topCommands
            .map(
              ([cmd, count], index) =>
                `${index + 1}. \`/${cmd}\` - ${count.toLocaleString()} uses`
            )
            .join('\n')
        : 'No commands executed yet';

    // Build embed
    const embed = {
      title: '📊 Bot Statistics',
      color: COLORS.blurple,
      fields: [
        {
          name: '📈 Usage',
          value: [
            `**Total Commands:** ${stats.totalCommands.toLocaleString()}`,
            `**Success Rate:** ${stats.successRate.toFixed(1)}%`,
            `**Unique Users Today:** ${stats.uniqueUsersToday.toLocaleString()}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '🤖 Infrastructure',
          value: [
            `**Platform:** ${getWorkerInfo()}`,
            `**Version:** 2.0.0`,
            `**Analytics:** ${env.ANALYTICS ? 'Enabled' : 'KV Only'}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '⭐ Top Commands',
          value: topCommandsText,
          inline: false,
        },
      ],
      footer: {
        text: 'Stats are stored in Cloudflare KV with 30-day retention',
      },
      timestamp: new Date().toISOString(),
    };

    return Response.json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        embeds: [embed],
        flags: 64, // Ephemeral - only visible to the user
      },
    });
  } catch (error) {
    if (logger) {
      logger.error('Error in stats command', error instanceof Error ? error : undefined);
    }

    return Response.json({
      type: 4,
      data: {
        embeds: [
          {
            title: '❌ Error',
            description: 'Failed to retrieve statistics. Please try again later.',
            color: COLORS.red,
          },
        ],
        flags: 64,
      },
    });
  }
}
