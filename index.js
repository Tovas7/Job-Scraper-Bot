require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

// File paths
const USER_DATA_FILE = path.join(__dirname, 'user_data.json');
const JOBS_FILE = path.join(__dirname, 'jobs.json');

// Initialize files with proper structure
function initFiles() {
  const files = {
    [USER_DATA_FILE]: '{}',
    [JOBS_FILE]: '[]'
  };

  Object.entries(files).forEach(([file, defaultValue]) => {
    try {
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, defaultValue);
      } else if (fs.readFileSync(file, 'utf8').trim() === '') {
        fs.writeFileSync(file, defaultValue);
      }
    } catch (err) {
      console.error(`Error initializing ${file}:`, err);
      fs.writeFileSync(file, defaultValue);
    }
  });
}

initFiles();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Helper functions
function getUserData(userId) {
  try {
    const data = fs.readFileSync(USER_DATA_FILE, 'utf8');
    const parsed = JSON.parse(data || '{}');
    return {
      channels: [],
      jobs: [],
      state: '',
      ...parsed[userId]
    };
  } catch (err) {
    console.error('Error reading user data:', err);
    return { channels: [], jobs: [], state: '' };
  }
}

function saveUserData(userId, userData) {
  try {
    const allData = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf8') || '{}');
    allData[userId] = userData;
    fs.writeFileSync(USER_DATA_FILE, JSON.stringify(allData, null, 2));
  } catch (err) {
    console.error('Error saving user data:', err);
    fs.writeFileSync(USER_DATA_FILE, JSON.stringify({ [userId]: userData }, null, 2));
  }
}

// Workflow implementation
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const userData = getUserData(userId);

  await ctx.reply(`👋 Welcome to JobBot, ${ctx.from.first_name || 'friend'}!`);
  await ctx.reply('What is your first name?');
  saveUserData(userId, { ...userData, state: 'awaiting_first_name' });
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  const userData = getUserData(userId);

  switch (userData.state) {
    case 'awaiting_first_name':
      await ctx.reply(`Nice to meet you, ${text}! What is your last name?`);
      saveUserData(userId, { 
        ...userData, 
        firstName: text,
        state: 'awaiting_last_name' 
      });
      break;

    case 'awaiting_last_name':
      await ctx.reply(
        `Thanks ${userData.firstName} ${text}! Now let's set up job preferences.`,
        Markup.keyboard([
          ['Remote', 'Full-time'],
          ['Part-time', 'Contract'],
          ['Done']
        ]).oneTime()
      );
      saveUserData(userId, {
        ...userData,
        lastName: text,
        state: 'awaiting_preferences'
      });
      break;

    case 'awaiting_preferences':
      if (text !== 'Done') {
        // Handle preference selection
        const preferences = userData.preferences || [];
        saveUserData(userId, {
          ...userData,
          preferences: [...preferences, text],
          state: 'awaiting_preferences'
        });
        await ctx.reply(`Added ${text} preference. Select more or click "Done"`);
      } else {
        await ctx.reply(
          'Setup complete! Now add channels with /addchannel @channelname',
          Markup.removeKeyboard()
        );
        saveUserData(userId, {
          ...userData,
          state: 'ready'
        });
      }
      break;
  }
});

bot.command('addchannel', async (ctx) => {
  const userId = ctx.from.id;
  const channelInput = ctx.message.text.split(' ')[1];

  if (!channelInput) {
    return ctx.reply('Usage: /addchannel @channelname');
  }

  const channel = channelInput.replace('@', '').trim();
  const userData = getUserData(userId);

  try {
    await ctx.telegram.sendChatAction(`@${channel}`, 'typing');
    
    if (!userData.channels.includes(channel)) {
      saveUserData(userId, {
        ...userData,
        channels: [...userData.channels, channel]
      });
      await ctx.reply(`✅ @${channel} added successfully!`);
    } else {
      await ctx.reply(`ℹ️ @${channel} was already added.`);
    }
  } catch (err) {
    await ctx.reply(`❌ Couldn't access @${channel}. Ensure:\n` +
                   `- You're a member\n- Channel exists\n- No typos`);
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('⚠️ An error occurred. Please try again.');
});

// Start bot
bot.launch().then(() => {
  console.log('Bot started successfully');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));