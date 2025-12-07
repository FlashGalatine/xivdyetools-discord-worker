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
    name: 'mixer',
    description: 'Generate a color gradient between two colors with intermediate dyes',
    options: [
      {
        name: 'start_color',
        description: 'Starting color: hex (e.g., #FF0000) or dye name',
        type: OptionType.STRING,
        required: true,
        autocomplete: true,
      },
      {
        name: 'end_color',
        description: 'Ending color: hex (e.g., #0000FF) or dye name',
        type: OptionType.STRING,
        required: true,
        autocomplete: true,
      },
      {
        name: 'steps',
        description: 'Number of color steps (default: 6)',
        type: OptionType.INTEGER,
        required: false,
        min_value: 2,
        max_value: 10,
      },
    ],
  },

  // =========================================================================
  // Phase 2: Image processing commands
  // =========================================================================
  {
    name: 'match_image',
    description: 'Extract colors from an image and find matching FFXIV dyes',
    options: [
      {
        name: 'image',
        description: 'Image to analyze',
        type: OptionType.ATTACHMENT,
        required: true,
      },
      {
        name: 'colors',
        description: 'Number of colors to extract (1-5)',
        type: OptionType.INTEGER,
        required: false,
        min_value: 1,
        max_value: 5,
      },
    ],
  },

  {
    name: 'accessibility',
    description: 'Check color accessibility for colorblind users or contrast',
    options: [
      {
        name: 'dye',
        description: 'Primary dye (hex code or dye name)',
        type: OptionType.STRING,
        required: true,
        autocomplete: true,
      },
      {
        name: 'dye2',
        description: 'Second dye for contrast comparison (optional)',
        type: OptionType.STRING,
        required: false,
        autocomplete: true,
      },
      {
        name: 'dye3',
        description: 'Third dye for contrast comparison (optional)',
        type: OptionType.STRING,
        required: false,
        autocomplete: true,
      },
      {
        name: 'dye4',
        description: 'Fourth dye for contrast comparison (optional)',
        type: OptionType.STRING,
        required: false,
        autocomplete: true,
      },
      {
        name: 'vision',
        description: 'Filter to specific vision type (single dye mode only)',
        type: OptionType.STRING,
        required: false,
        choices: [
          { name: 'Protanopia (red-blind)', value: 'protanopia' },
          { name: 'Deuteranopia (green-blind)', value: 'deuteranopia' },
          { name: 'Tritanopia (blue-blind)', value: 'tritanopia' },
        ],
      },
    ],
  },

  {
    name: 'manual',
    description: 'Show help and usage guide for all commands',
  },

  // =========================================================================
  // Phase 3: Feature parity commands
  // =========================================================================
  {
    name: 'comparison',
    description: 'Compare 2-4 dyes side-by-side with color analysis',
    options: [
      {
        name: 'dye1',
        description: 'First dye (hex code or dye name)',
        type: OptionType.STRING,
        required: true,
        autocomplete: true,
      },
      {
        name: 'dye2',
        description: 'Second dye (hex code or dye name)',
        type: OptionType.STRING,
        required: true,
        autocomplete: true,
      },
      {
        name: 'dye3',
        description: 'Third dye (optional)',
        type: OptionType.STRING,
        required: false,
        autocomplete: true,
      },
      {
        name: 'dye4',
        description: 'Fourth dye (optional)',
        type: OptionType.STRING,
        required: false,
        autocomplete: true,
      },
    ],
  },

  {
    name: 'language',
    description: 'Manage your language preference for bot responses',
    options: [
      {
        name: 'set',
        description: 'Set your preferred language',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'locale',
            description: 'Language to use',
            type: OptionType.STRING,
            required: true,
            choices: [
              { name: 'English', value: 'en' },
              { name: '日本語 (Japanese)', value: 'ja' },
              { name: 'Deutsch (German)', value: 'de' },
              { name: 'Français (French)', value: 'fr' },
              { name: '한국어 (Korean)', value: 'ko' },
              { name: '中文 (Chinese)', value: 'zh' },
            ],
          },
        ],
      },
      {
        name: 'show',
        description: 'Show your current language setting',
        type: OptionType.SUB_COMMAND,
      },
      {
        name: 'reset',
        description: 'Reset to use Discord client language',
        type: OptionType.SUB_COMMAND,
      },
    ],
  },

  {
    name: 'favorites',
    description: 'Manage your favorite dyes',
    options: [
      {
        name: 'add',
        description: 'Add a dye to your favorites',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'dye',
            description: 'Dye name or hex color',
            type: OptionType.STRING,
            required: true,
            autocomplete: true,
          },
        ],
      },
      {
        name: 'remove',
        description: 'Remove a dye from your favorites',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'dye',
            description: 'Dye name',
            type: OptionType.STRING,
            required: true,
            autocomplete: true,
          },
        ],
      },
      {
        name: 'list',
        description: 'Show all your favorite dyes',
        type: OptionType.SUB_COMMAND,
      },
      {
        name: 'clear',
        description: 'Remove all favorites',
        type: OptionType.SUB_COMMAND,
      },
    ],
  },

  {
    name: 'collection',
    description: 'Manage your dye collections',
    options: [
      {
        name: 'create',
        description: 'Create a new collection',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'name',
            description: 'Collection name (max 50 characters)',
            type: OptionType.STRING,
            required: true,
          },
          {
            name: 'description',
            description: 'Optional description for the collection',
            type: OptionType.STRING,
            required: false,
          },
        ],
      },
      {
        name: 'delete',
        description: 'Delete a collection',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'name',
            description: 'Collection name',
            type: OptionType.STRING,
            required: true,
          },
        ],
      },
      {
        name: 'add',
        description: 'Add a dye to a collection',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'name',
            description: 'Collection name',
            type: OptionType.STRING,
            required: true,
          },
          {
            name: 'dye',
            description: 'Dye name or hex color',
            type: OptionType.STRING,
            required: true,
            autocomplete: true,
          },
        ],
      },
      {
        name: 'remove',
        description: 'Remove a dye from a collection',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'name',
            description: 'Collection name',
            type: OptionType.STRING,
            required: true,
          },
          {
            name: 'dye',
            description: 'Dye name',
            type: OptionType.STRING,
            required: true,
            autocomplete: true,
          },
        ],
      },
      {
        name: 'show',
        description: 'Display a collection',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'name',
            description: 'Collection name',
            type: OptionType.STRING,
            required: true,
          },
        ],
      },
      {
        name: 'list',
        description: 'List all your collections',
        type: OptionType.SUB_COMMAND,
      },
      {
        name: 'rename',
        description: 'Rename a collection',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'name',
            description: 'Current collection name',
            type: OptionType.STRING,
            required: true,
          },
          {
            name: 'new_name',
            description: 'New collection name',
            type: OptionType.STRING,
            required: true,
          },
        ],
      },
    ],
  },

  // =========================================================================
  // Phase 4: Community presets
  // =========================================================================
  {
    name: 'preset',
    description: 'Browse, submit, and vote on community color presets',
    options: [
      {
        name: 'list',
        description: 'Browse community presets',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'category',
            description: 'Filter by category',
            type: OptionType.STRING,
            required: false,
            choices: [
              { name: '⚔️ FFXIV Jobs', value: 'jobs' },
              { name: '🏛️ Grand Companies', value: 'grand-companies' },
              { name: '🍂 Seasons', value: 'seasons' },
              { name: '🎉 FFXIV Events', value: 'events' },
              { name: '🎨 Aesthetics', value: 'aesthetics' },
              { name: '🌐 Community', value: 'community' },
            ],
          },
          {
            name: 'sort',
            description: 'Sort order',
            type: OptionType.STRING,
            required: false,
            choices: [
              { name: '⭐ Most Popular', value: 'popular' },
              { name: '🕐 Most Recent', value: 'recent' },
              { name: '🔤 Alphabetical', value: 'name' },
            ],
          },
        ],
      },
      {
        name: 'show',
        description: 'Display a specific preset',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'name',
            description: 'Preset name',
            type: OptionType.STRING,
            required: true,
            autocomplete: true,
          },
        ],
      },
      {
        name: 'random',
        description: 'Get a random preset for inspiration',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'category',
            description: 'Filter by category',
            type: OptionType.STRING,
            required: false,
            choices: [
              { name: '⚔️ FFXIV Jobs', value: 'jobs' },
              { name: '🏛️ Grand Companies', value: 'grand-companies' },
              { name: '🍂 Seasons', value: 'seasons' },
              { name: '🎉 FFXIV Events', value: 'events' },
              { name: '🎨 Aesthetics', value: 'aesthetics' },
              { name: '🌐 Community', value: 'community' },
            ],
          },
        ],
      },
      {
        name: 'submit',
        description: 'Submit a new community preset',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'preset_name',
            description: 'Name for your preset (2-50 characters)',
            type: OptionType.STRING,
            required: true,
          },
          {
            name: 'description',
            description: 'Describe your preset (10-200 characters)',
            type: OptionType.STRING,
            required: true,
          },
          {
            name: 'category',
            description: 'Preset category',
            type: OptionType.STRING,
            required: true,
            choices: [
              { name: '⚔️ FFXIV Jobs', value: 'jobs' },
              { name: '🏛️ Grand Companies', value: 'grand-companies' },
              { name: '🍂 Seasons', value: 'seasons' },
              { name: '🎉 FFXIV Events', value: 'events' },
              { name: '🎨 Aesthetics', value: 'aesthetics' },
              { name: '🌐 Community', value: 'community' },
            ],
          },
          {
            name: 'dye1',
            description: 'First dye (required)',
            type: OptionType.STRING,
            required: true,
            autocomplete: true,
          },
          {
            name: 'dye2',
            description: 'Second dye (required)',
            type: OptionType.STRING,
            required: true,
            autocomplete: true,
          },
          {
            name: 'dye3',
            description: 'Third dye (optional)',
            type: OptionType.STRING,
            required: false,
            autocomplete: true,
          },
          {
            name: 'dye4',
            description: 'Fourth dye (optional)',
            type: OptionType.STRING,
            required: false,
            autocomplete: true,
          },
          {
            name: 'dye5',
            description: 'Fifth dye (optional)',
            type: OptionType.STRING,
            required: false,
            autocomplete: true,
          },
          {
            name: 'tags',
            description: 'Comma-separated tags (optional, max 10)',
            type: OptionType.STRING,
            required: false,
          },
        ],
      },
      {
        name: 'vote',
        description: 'Toggle your vote on a preset',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'preset',
            description: 'Preset to vote on',
            type: OptionType.STRING,
            required: true,
            autocomplete: true,
          },
        ],
      },
      {
        name: 'moderate',
        description: 'Moderation actions (moderators only)',
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: 'action',
            description: 'Action to perform',
            type: OptionType.STRING,
            required: true,
            choices: [
              { name: '📋 View Pending', value: 'pending' },
              { name: '✅ Approve', value: 'approve' },
              { name: '❌ Reject', value: 'reject' },
              { name: '📊 Statistics', value: 'stats' },
            ],
          },
          {
            name: 'preset_id',
            description: 'Preset to moderate (for approve/reject)',
            type: OptionType.STRING,
            required: false,
            autocomplete: true,
          },
          {
            name: 'reason',
            description: 'Reason for rejection (required for reject)',
            type: OptionType.STRING,
            required: false,
          },
        ],
      },
    ],
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
