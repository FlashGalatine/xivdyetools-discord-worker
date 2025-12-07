/**
 * Discord Slash Command Registration Script
 *
 * This script registers (or updates) slash commands with Discord's API.
 * Run with: npm run register-commands
 *
 * You need to set these environment variables:
 * - DISCORD_TOKEN: Your bot token
 * - DISCORD_CLIENT_ID: Your application's client ID
 *
 * For development, you can also set:
 * - DISCORD_GUILD_ID: Register commands to a specific guild (faster updates)
 *
 * @see https://discord.com/developers/docs/interactions/application-commands
 */

import 'dotenv/config';

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Discord command option types
 * @see https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-type
 */
const OptionType = {
  SUB_COMMAND: 1,
  SUB_COMMAND_GROUP: 2,
  STRING: 3,
  INTEGER: 4,
  BOOLEAN: 5,
  USER: 6,
  CHANNEL: 7,
  ROLE: 8,
  MENTIONABLE: 9,
  NUMBER: 10,
  ATTACHMENT: 11,
} as const;

/**
 * All slash commands for the bot
 * Start with minimal set for Phase 0, expand in later phases
 */
const commands = [
  // =========================================================================
  // Phase 0: Basic commands for testing
  // =========================================================================
  {
    name: 'about',
    description: 'Show information about the XIV Dye Tools bot',
  },

  // =========================================================================
  // Phase 1: Core commands (to be implemented)
  // =========================================================================
  {
    name: 'harmony',
    description: 'Generate harmonious dye combinations from a color',
    options: [
      {
        name: 'color',
        description: 'Base color (hex code like #FF5733 or dye name)',
        type: OptionType.STRING,
        required: true,
        autocomplete: true,
      },
      {
        name: 'type',
        description: 'Type of color harmony',
        type: OptionType.STRING,
        required: false,
        choices: [
          { name: 'Complementary (opposite colors)', value: 'complementary' },
          { name: 'Analogous (adjacent colors)', value: 'analogous' },
          { name: 'Triadic (3 evenly spaced)', value: 'triadic' },
          { name: 'Split-Complementary', value: 'split-complementary' },
          { name: 'Tetradic (4 colors)', value: 'tetradic' },
          { name: 'Square (4 evenly spaced)', value: 'square' },
          { name: 'Monochromatic (shades)', value: 'monochromatic' },
        ],
      },
    ],
  },

  {
    name: 'dye',
    description: 'Search and explore FFXIV dyes',
    options: [
      {
        name: 'search',
        description: 'Search for dyes by name',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'query',
            description: 'Search term (dye name)',
            type: OptionType.STRING,
            required: true,
            autocomplete: true,
          },
        ],
      },
      {
        name: 'info',
        description: 'Get detailed information about a specific dye',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'name',
            description: 'Dye name',
            type: OptionType.STRING,
            required: true,
            autocomplete: true,
          },
        ],
      },
      {
        name: 'list',
        description: 'List dyes by category',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'category',
            description: 'Dye category',
            type: OptionType.STRING,
            required: false,
            choices: [
              { name: 'Red Dyes', value: 'Reds' },
              { name: 'Brown Dyes', value: 'Browns' },
              { name: 'Yellow Dyes', value: 'Yellows' },
              { name: 'Green Dyes', value: 'Greens' },
              { name: 'Blue Dyes', value: 'Blues' },
              { name: 'Purple Dyes', value: 'Purples' },
              { name: 'Neutral (White/Black)', value: 'Neutral' },
              { name: 'Special Dyes', value: 'Special' },
            ],
          },
        ],
      },
      {
        name: 'random',
        description: 'Show 5 randomly selected dyes',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'unique_categories',
            description: 'Limit to 1 dye per category (default: false)',
            type: OptionType.BOOLEAN,
            required: false,
          },
        ],
      },
    ],
  },

  {
    name: 'match',
    description: 'Find the closest FFXIV dye to a color',
    options: [
      {
        name: 'color',
        description: 'Color to match (hex code like #FF5733)',
        type: OptionType.STRING,
        required: true,
      },
      {
        name: 'count',
        description: 'Number of matches to show (1-10)',
        type: OptionType.INTEGER,
        required: false,
        min_value: 1,
        max_value: 10,
      },
    ],
  },

  {
    name: 'manual',
    description: 'Show help and usage guide for all commands',
  },
];

// ============================================================================
// Registration Logic
// ============================================================================

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID; // Optional: for guild-specific commands

  if (!token) {
    console.error('Error: DISCORD_TOKEN environment variable is not set');
    console.log('\nSet it with:');
    console.log('  $env:DISCORD_TOKEN = "your-bot-token"  (PowerShell)');
    console.log('  export DISCORD_TOKEN="your-bot-token"  (Bash)');
    process.exit(1);
  }

  if (!clientId) {
    console.error('Error: DISCORD_CLIENT_ID environment variable is not set');
    console.log('\nSet it with:');
    console.log('  $env:DISCORD_CLIENT_ID = "your-client-id"  (PowerShell)');
    console.log('  export DISCORD_CLIENT_ID="your-client-id"  (Bash)');
    process.exit(1);
  }

  // Determine the registration URL
  // Guild commands update instantly, global commands take up to 1 hour
  const url = guildId
    ? `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${clientId}/commands`;

  console.log(`\nRegistering ${commands.length} commands...`);
  console.log(`Target: ${guildId ? `Guild ${guildId}` : 'Global'}`);
  console.log('');

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to register commands: ${response.status}`);
      console.error(error);
      process.exit(1);
    }

    const data = await response.json() as Array<{ name: string; id: string }>;
    console.log(`Successfully registered ${data.length} commands:\n`);

    for (const cmd of data) {
      console.log(`  /${cmd.name} (ID: ${cmd.id})`);
    }

    if (!guildId) {
      console.log('\nNote: Global commands may take up to 1 hour to appear.');
      console.log('For faster testing, set DISCORD_GUILD_ID to register guild commands.');
    }
  } catch (error) {
    console.error('Error registering commands:', error);
    process.exit(1);
  }
}

// Run the registration
registerCommands();
