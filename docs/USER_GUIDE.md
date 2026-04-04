# VoxChronicle User Guide

Welcome to VoxChronicle! This guide will help you set up and use VoxChronicle to automatically transcribe your tabletop RPG sessions and publish them as beautiful chronicles to Kanka.

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
   - [Installation](#installation)
   - [Enabling the Module](#enabling-the-module)
3. [Configuration](#configuration)
   - [OpenAI API Key](#openai-api-key)
   - [Kanka Integration](#kanka-integration)
   - [Audio Settings](#audio-settings)
   - [Additional Settings](#additional-settings)
4. [Recording Sessions](#recording-sessions)
   - [Starting a Recording](#starting-a-recording)
   - [During the Session](#during-the-session)
   - [Stopping the Recording](#stopping-the-recording)
5. [Transcription](#transcription)
   - [Automatic Transcription](#automatic-transcription)
   - [Speaker Labeling](#speaker-labeling)
   - [Reviewing the Transcript](#reviewing-the-transcript)
6. [Entity Extraction](#entity-extraction)
   - [Automatic Extraction](#automatic-extraction)
   - [Reviewing Entities](#reviewing-entities)
   - [Editing Entities](#editing-entities)
7. [AI Image Generation](#ai-image-generation)
   - [Character Portraits](#character-portraits)
   - [Location Images](#location-images)
   - [Scene Illustrations](#scene-illustrations)
8. [Publishing to Kanka](#publishing-to-kanka)
   - [Creating Chronicles](#creating-chronicles)
   - [Creating Entities](#creating-entities)
   - [Uploading Images](#uploading-images)
9. [Cost Management](#cost-management)
   - [Understanding API Costs](#understanding-api-costs)
   - [Tips for Reducing Costs](#tips-for-reducing-costs)
10. [Tips and Best Practices](#tips-and-best-practices)
11. [Troubleshooting](#troubleshooting)
12. [Frequently Asked Questions](#frequently-asked-questions)

---

## Overview

VoxChronicle transforms your tabletop RPG sessions into rich, documented chronicles. Here's what it does:

1. **Records** your session audio (from your microphone or Foundry VTT's built-in voice chat)
2. **Transcribes** the audio using AI, identifying who said what
3. **Extracts** NPCs, locations, and items mentioned during play
4. **Generates** AI portraits for characters and locations
5. **Publishes** everything to your Kanka campaign

Perfect for GMs and players who want to keep a detailed record of their adventures without taking notes during play!

---

## Getting Started

### Installation

VoxChronicle can be installed directly within Foundry VTT:

1. Open Foundry VTT and navigate to **Add-on Modules**
2. Click **Install Module**
3. Search for "VoxChronicle" or paste this manifest URL:
   ```
   https://github.com/Aiacos/VoxChronicle/releases/latest/download/module.json
   ```
4. Click **Install**
5. Wait for the installation to complete

For manual installation instructions, see the [README.md](../README.md).

### Enabling the Module

After installation:

1. Launch your World in Foundry VTT
2. Go to **Settings** (gear icon) → **Manage Modules**
3. Find **VoxChronicle** in the list and check the box
4. Click **Save Module Settings**
5. The page will reload with VoxChronicle enabled

You should now see a VoxChronicle icon in the left sidebar controls.

---

## Configuration

Before using VoxChronicle, you need to configure your API credentials.

### OpenAI API Key

The OpenAI API key is required for:
- Audio transcription
- Entity extraction
- AI image generation

**How to get your OpenAI API key:**

1. Go to [platform.openai.com](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click **Create new secret key**
4. Give it a name like "VoxChronicle"
5. Copy the key (you won't be able to see it again!)

**Entering your API key in VoxChronicle:**

1. In Foundry VTT, go to **Settings** → **Module Settings**
2. Find the **VoxChronicle** section
3. Paste your key in the **OpenAI API Key** field
4. Click **Save**

> **Important:** Your API key is stored locally in your browser. Each player needs to enter their own key if they want to use VoxChronicle features.

### Alternative AI Providers (Optional)

VoxChronicle supports multiple AI chat providers. If your primary provider (OpenAI) experiences downtime or quota issues, the module automatically tries other configured providers. No user action is needed -- this happens transparently.

#### Mistral AI Configuration

Mistral AI is an optional alternative chat provider offering competitive pricing.

**How to get your Mistral API key:**

1. Go to [console.mistral.ai](https://console.mistral.ai/)
2. Sign in or create an account
3. Navigate to **API Keys**
4. Click **Create new key**
5. Copy the key

**Entering your Mistral API key in VoxChronicle:**

1. In Foundry VTT, go to **Settings** -> **Module Settings**
2. Find the **VoxChronicle** section
3. Paste your key in the **Mistral API Key** field
4. Click **Save**

> **Note:** Mistral is optional. If configured alongside OpenAI, it serves as a fallback provider. You can also configure Anthropic and Google API keys for additional redundancy.

#### Provider Fallback

When multiple AI providers are configured, VoxChronicle uses an automatic fallback system:

- If the primary provider fails with a retryable error (quota exceeded, server error, timeout), the module automatically tries the next available provider
- Authentication errors (invalid API key) are **not** retried -- they fail immediately so you can fix your credentials
- No configuration is needed beyond entering your API keys -- the fallback is fully automatic
- You can check which provider handled your last request in the browser console (debug mode)

### Kanka Integration

Kanka is where your session chronicles and entities will be published.

**Getting your Kanka credentials:**

1. Go to [app.kanka.io](https://app.kanka.io) and sign in
2. Navigate to **Settings** (click your profile → Settings)
3. Go to **API** tab
4. Click **Create a New Token**
5. Copy the generated token

**Finding your Campaign ID:**

1. Open your campaign in Kanka
2. Look at the URL: `https://app.kanka.io/w/XXXXX/...`
3. The number after `/w/` is your Campaign ID

**Entering Kanka credentials:**

1. In Foundry VTT, go to **Settings** → **Module Settings** → **VoxChronicle**
2. Paste your token in **Kanka API Token**
3. Enter your Campaign ID in **Kanka Campaign ID**
4. Click **Save**

> **Note:** Kanka tokens expire after 364 days. VoxChronicle will warn you when renewal is needed.

### Audio Settings

Configure how VoxChronicle captures audio:

| Setting | Description | Recommendation |
|---------|-------------|----------------|
| **Audio Source** | Where to capture audio from | Use "Automatic" - VoxChronicle will try Foundry's WebRTC first, then fall back to your microphone |
| **Echo Cancellation** | Removes echo from speaker audio | Enable if you hear echo in recordings |
| **Noise Suppression** | Reduces background noise | Enable for noisy environments |

### Additional Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Transcription Language** | Specify language for better accuracy | Auto-detect |
| **Image Quality** | Medium ($0.02/image) or High ($0.04/image) | Medium |
| **Max Images Per Session** | Limit AI images to control costs | 3 |
| **Auto-Extract Entities** | Automatically extract entities | Enabled |
| **Confirm Entity Creation** | Review before creating in Kanka | Enabled |

---

## Recording Sessions

### Starting a Recording

1. Click the **VoxChronicle** icon in the left sidebar
2. The Session Recorder panel will open
3. Click **Start Recording**
4. If prompted, grant microphone access in your browser
5. A recording indicator will appear showing the duration

**First-time recording?** Your browser will ask for microphone permission. Click "Allow" to proceed.

### During the Session

While recording:

- A timer shows the recording duration
- The status indicator shows "Recording..."
- You can **Pause** the recording during breaks (click "Pause")
- Click **Resume** to continue after a pause
- File size is displayed to help monitor length

**Tips for best results:**

- Speak clearly and take turns (helps with speaker identification)
- Minimize background noise
- Use a dedicated microphone if possible
- Pause during long breaks to save recording space

### Stopping the Recording

When your session ends:

1. Click **Stop Recording**
2. VoxChronicle will save the audio
3. Processing will begin automatically (or you can trigger it manually)

> **Note:** Recordings are stored temporarily in your browser. Make sure to complete transcription and publishing before closing the browser.

---

## Transcription

### Automatic Transcription

After stopping a recording, VoxChronicle automatically:

1. Uploads the audio to OpenAI's transcription service
2. Converts speech to text
3. Identifies different speakers (diarization)
4. Returns timestamped segments

**For long recordings:**

If your recording exceeds 25MB, VoxChronicle automatically splits it into chunks and processes each one separately. You'll see progress updates like "Processing chunk 2 of 5..."

### Speaker Labeling

OpenAI's transcription identifies speakers as "SPEAKER_00", "SPEAKER_01", etc. You can map these to actual player names:

1. Go to **Settings** → **Module Settings** → **VoxChronicle**
2. Click **Configure Speakers**
3. For each detected speaker ID, enter the corresponding name:
   - `SPEAKER_00` → "Game Master"
   - `SPEAKER_01` → "Aldric (John)"
   - `SPEAKER_02` → "Elara (Sarah)"
4. Click **Save Labels**

**Tips:**

- Run a short test recording to identify speaker assignments
- The same person may be assigned different IDs in different sessions
- You can update labels after seeing the initial transcription

### Reviewing the Transcript

After transcription:

1. View the formatted transcript with speaker names
2. Each segment shows:
   - Speaker name
   - What they said
   - Timestamp (optional)
3. You can edit the transcript before publishing

---

## Entity Extraction

### Automatic Extraction

VoxChronicle uses AI to identify entities mentioned in your session:

- **Characters**: NPCs, mentioned characters (distinguishes from PCs)
- **Locations**: Places visited or mentioned
- **Items**: Notable objects, weapons, artifacts

The AI analyzes context to provide descriptions based on what was said during the session.

### Reviewing Entities

The Entity Preview dialog shows:

1. **Characters** tab: Detected NPCs with descriptions
2. **Locations** tab: Places mentioned with types (tavern, dungeon, etc.)
3. **Items** tab: Objects with descriptions

For each entity, you'll see:
- Name
- Type/Category
- Auto-generated description
- Checkbox to include/exclude

### Editing Entities

Before publishing, you can:

1. **Select/Deselect** entities using checkboxes
2. **Edit descriptions** by clicking the edit icon
3. **Change entity type** (e.g., change NPC to PC)
4. **Add missing entities** manually
5. **Remove duplicates** if the AI found existing entities

---

## AI Image Generation

### Character Portraits

Generate portraits for NPCs and characters:

1. In the Entity Preview, select a character
2. Click **Generate Portrait**
3. Wait for gpt-image-1 to create the image
4. Preview the result
5. Accept or regenerate

The AI creates prompts like: *"Fantasy RPG character portrait: A grizzled dwarf warrior with a braided beard and scarred face, dramatic lighting, detailed"*

### Location Images

Generate images for locations:

1. Select a location in Entity Preview
2. Click **Generate Image**
3. The AI creates a scene illustration

Location prompts produce wide shots: *"Fantasy RPG location scene: A cozy tavern at a crossroads with a roaring fireplace, atmospheric, detailed environment"*

### Scene Illustrations

For dramatic moments from your session:

1. VoxChronicle identifies "salient moments" - dramatic scenes
2. These appear in the chronicle preview
3. Generate illustrations for key story beats

> **Cost note:** Each image costs $0.04 (medium) or $0.08 (high). Use the "Max Images Per Session" setting to control costs.

---

## Publishing to Kanka

### Creating Chronicles

A chronicle is created as a Kanka **Journal** entry containing:

- Session title and date
- Full transcript (with speaker names)
- Summary of events
- List of entities encountered
- Generated images

**To publish:**

1. Review the chronicle preview
2. Click **Publish to Kanka**
3. VoxChronicle creates the journal entry
4. A link appears to view it in Kanka

### Creating Entities

Selected entities are created in Kanka:

- **Characters** → Kanka Characters (marked as NPC or PC)
- **Locations** → Kanka Locations (with type like "Tavern", "Dungeon")
- **Items** → Kanka Items (with type like "Weapon", "Artifact")

Each entity includes:
- Name from extraction
- Description from session context
- AI-generated portrait (if created)

### Uploading Images

Generated images are automatically uploaded:

1. Images are returned as base64 data from gpt-image-1
2. Converted and uploaded to the corresponding Kanka entity
3. Set as the entity's portrait/image

> **Note:** gpt-image-1 returns base64 data directly, so there are no URL expiry concerns. VoxChronicle handles the conversion and upload automatically during the publish process.

---

## Cost Management

### Understanding API Costs

VoxChronicle uses paid API services:

| Service | Cost | Example |
|---------|------|---------|
| **Transcription** | $0.006/minute | 3-hour session = $1.08 |
| **Image (Medium)** | $0.02/image | 5 images = $0.10 |
| **Image (High)** | $0.04/image | 5 images = $0.20 |

**Example session:**
- 3-hour session transcription: $1.08
- 5 medium-quality portraits: $0.20
- **Total: ~$1.28**

### Tips for Reducing Costs

1. **Pause during breaks** - Don't record silence or off-topic chat
2. **Limit images** - Set "Max Images Per Session" to 3-5
3. **Use Medium quality** - High is twice the cost with minimal visible difference
4. **Skip unnecessary images** - You don't need portraits for every NPC
5. **Review before generating** - Check entity descriptions before image generation
6. **Set a budget** - OpenAI allows setting monthly spending limits

---

## Tips and Best Practices

### For Better Recordings

1. **Use a quality microphone** - Built-in laptop mics work but dedicated mics are clearer
2. **Reduce background noise** - Close windows, mute notifications
3. **Speak clearly** - Enunciate, especially for character names
4. **Take turns** - Helps the AI identify different speakers
5. **Name things explicitly** - "Let's go to the Silver Dragon Inn" works better than "let's go to the tavern"

### For Better Transcription

1. **Specify language** - If your group speaks a specific language, set it in settings
2. **Label speakers early** - Do a test recording to map speaker IDs
3. **Use consistent names** - Always use the same name for NPCs
4. **Review and correct** - Check important names and places before publishing

### For Better Entity Extraction

1. **Name your NPCs** - "You meet Thorin, the blacksmith" extracts better than "you meet a blacksmith"
2. **Describe locations** - "The Silver Dragon Inn is a cozy tavern on the king's road"
3. **Check for duplicates** - The AI might extract "The Inn" and "Silver Dragon Inn" as separate entities
4. **Edit descriptions** - AI descriptions are a starting point; improve them with your knowledge

### For Better Images

1. **Write good descriptions** - More detail = better images
2. **Use consistent style** - Set a campaign style in settings for visual consistency
3. **Regenerate if needed** - First result not great? Try again
4. **Save favorites** - Download images you particularly like

---

## Troubleshooting

### Microphone Issues

**Problem:** Recording doesn't start / No audio captured

**Solutions:**
1. Check browser permissions (look for microphone icon in address bar)
2. Ensure no other app is using the microphone
3. Try a different audio source (Microphone vs Foundry WebRTC)
4. Refresh the page and try again
5. Try a different browser (Chrome works best)

### Transcription Failures

**Problem:** Transcription fails or returns errors

**Solutions:**
1. **Check your API key** - Verify it's entered correctly in settings
2. **Check your OpenAI balance** - Ensure you have credits
3. **Recording too short** - Very short recordings may fail
4. **Network issues** - Check your internet connection
5. **Check console** - Press F12, look at Console tab for error details

### Kanka Publishing Issues

**Problem:** Can't publish to Kanka

**Solutions:**
1. **Verify API token** - Re-enter your Kanka token
2. **Check Campaign ID** - Make sure it's the numeric ID from the URL
3. **Permissions** - Ensure you have write access to the campaign
4. **Rate limits** - Wait a minute and try again
5. **Token expiry** - Regenerate your token at Kanka if it's been over a year

### No Entities Found

**Problem:** Entity extraction returns nothing

**Solutions:**
1. **Longer transcription** - Short recordings may not have enough content
2. **More specific names** - Generic references ("the guard") don't extract well
3. **Proper nouns** - Use capitalized names for entities
4. **Check transcription** - Ensure the transcript captured speech correctly

---

## Frequently Asked Questions

### General

**Q: Do I need both OpenAI and Kanka accounts?**

A: OpenAI is required for transcription and images. Kanka is only needed if you want to publish chronicles. You can use VoxChronicle for transcription alone.

**Q: Can I use VoxChronicle without paying for OpenAI?**

A: No. OpenAI doesn't have a free tier. You'll need to add a payment method and pay for usage (typically $1-2 per session).

**Q: Does VoxChronicle work offline?**

A: Partially. Transcription can run locally via a self-hosted Whisper backend (see docs/WHISPER_SETUP.md). However, AI suggestions, image generation, and Kanka publishing require internet connectivity.

### Recording

**Q: Can I record if other players use Discord for voice?**

A: Yes! Use the "Browser Microphone" audio source. Your microphone will capture audio from your speakers/headphones as well as your voice.

**Q: How long can recordings be?**

A: There's no hard limit, but very long recordings (8+ hours) may take a long time to transcribe. Consider pausing during breaks.

**Q: Can I import existing audio files?**

A: Not currently. VoxChronicle only processes audio it records directly.

### Transcription

**Q: How accurate is the transcription?**

A: Very accurate for clear speech in supported languages. Accuracy decreases with background noise, multiple people talking, or unusual accents.

**Q: Why are speakers labeled wrong?**

A: Speaker diarization isn't perfect. The same person might get different IDs across recordings. Use the Speaker Labeling feature to correct this.

**Q: Can it handle multiple languages in one session?**

A: The AI can handle some code-switching, but accuracy is best with a single language. Set the primary language in settings.

### Kanka

**Q: Will VoxChronicle overwrite my existing Kanka entities?**

A: No. It always creates new entities. It checks for existing entities by name and skips duplicates.

**Q: Can I choose where entities are created in Kanka?**

A: Not currently. Entities are created at the campaign root. You can organize them in Kanka afterward.

**Q: What Kanka subscription do I need?**

A: The free tier works fine. Premium subscribers get higher API rate limits (90/min vs 30/min).

### Costs

**Q: Why is my bill higher than expected?**

A: Common causes:
- Long recordings (transcription is billed per minute)
- Many generated images
- High quality images
- Multiple attempts/regenerations

**Q: Can I set spending limits?**

A: Yes, in your OpenAI account settings. This is recommended!

**Q: Are there any free alternatives?**

A: Not currently. The features VoxChronicle provides require powerful AI services that have associated costs.

---

## Getting Help

If you encounter issues not covered here:

- **Bug Reports**: [GitHub Issues](https://github.com/Aiacos/VoxChronicle/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/Aiacos/VoxChronicle/discussions)
- **Community Help**: Join the conversation on the Foundry VTT Discord

---

## Related Documentation

- [README](../README.md) - Project overview and quick start
- [Architecture](./ARCHITECTURE.md) - Technical system design
- [API Reference](./API_REFERENCE.md) - Developer documentation
- [CLAUDE.md](../CLAUDE.md) - AI development context

---

*Happy chronicling! May your sessions be legendary and your transcriptions accurate.*
