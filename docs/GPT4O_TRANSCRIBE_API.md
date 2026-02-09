# GPT-4o Transcribe API Documentation

This document provides comprehensive documentation for the OpenAI GPT-4o audio transcription API as used in VoxChronicle. It covers the API contract, request/response formats, speaker diarization, and chunking strategies.

## Table of Contents

1. [Overview](#overview)
2. [API Endpoint](#api-endpoint)
3. [Authentication](#authentication)
4. [Request Format](#request-format)
5. [Request Parameters](#request-parameters)
6. [Response Structure](#response-structure)
7. [Speaker Diarization Format](#speaker-diarization-format)
8. [Chunking Strategy](#chunking-strategy)
9. [Error Handling](#error-handling)
10. [Cost Considerations](#cost-considerations)
11. [Code Examples](#code-examples)
12. [Best Practices](#best-practices)

---

## Overview

The GPT-4o transcription API provides high-quality audio transcription with optional speaker diarization (speaker identification). VoxChronicle uses this API to transcribe tabletop RPG sessions with automatic speaker identification and labeling.

### Key Features

- **Speaker Diarization**: Automatically identifies different speakers (SPEAKER_00, SPEAKER_01, etc.)
- **High Accuracy**: GPT-4o provides superior transcription quality compared to Whisper
- **Multiple Languages**: Supports 50+ languages with automatic detection or manual specification
- **Chunking Support**: Handles long audio files by splitting them into manageable segments
- **Timing Information**: Returns precise timestamps for each segment

### Available Models

| Model | Description | Diarization Support |
|-------|-------------|---------------------|
| `gpt-4o-transcribe-diarize` | GPT-4o with speaker identification | ✅ Yes |
| `gpt-4o-transcribe` | GPT-4o without diarization | ❌ No |
| `whisper-1` | OpenAI Whisper (legacy) | ❌ No |

---

## API Endpoint

**Base URL:** `https://api.openai.com/v1`

**Endpoint:** `POST /audio/transcriptions`

**Full URL:** `https://api.openai.com/v1/audio/transcriptions`

---

## Authentication

Authentication is performed using an API key passed in the `Authorization` header:

```http
Authorization: Bearer YOUR_API_KEY
```

API keys can be obtained from the [OpenAI Platform](https://platform.openai.com/api-keys).

---

## Request Format

**CRITICAL:** The transcription API requires `multipart/form-data` encoding, **NOT** JSON.

### Content-Type

```http
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...
```

**Note:** Do NOT manually set the `Content-Type` header when using FormData in JavaScript. The browser will automatically set it with the correct boundary parameter.

### JavaScript Example

```javascript
const formData = new FormData();
formData.append('file', audioBlob, 'session.webm');
formData.append('model', 'gpt-4o-transcribe-diarize');
formData.append('response_format', 'diarized_json');

const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`
    // Do NOT set Content-Type - browser sets it automatically
  },
  body: formData
});
```

---

## Request Parameters

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `file` | File/Blob | The audio file to transcribe. Supported formats: webm, mp3, wav, m4a, ogg, flac. **Maximum size: 25MB** |
| `model` | string | The transcription model to use: `gpt-4o-transcribe-diarize`, `gpt-4o-transcribe`, or `whisper-1` |

### Optional Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `response_format` | string | `json` | Response format: `diarized_json`, `json`, `verbose_json`, `text`, `srt`, `vtt` |
| `language` | string | auto-detect | ISO-639-1 language code (e.g., `en`, `it`, `es`, `de`, `fr`) |
| `prompt` | string | none | Optional context to improve accuracy. Use for domain-specific terminology, proper nouns, character names, etc. |
| `chunking_strategy` | string | `auto` | Chunking strategy for long audio: `auto` (recommended) or `none` |
| `temperature` | number | 0 | Sampling temperature between 0 and 1. Higher values increase randomness. |

### Supported Audio Formats

- **WebM** (`.webm`) - Recommended for browser recording
- **MP3** (`.mp3`)
- **WAV** (`.wav`)
- **M4A** (`.m4a`)
- **OGG** (`.ogg`)
- **FLAC** (`.flac`)

### Supported Languages

The API supports 50+ languages. Common ones include:

| Code | Language | Code | Language |
|------|----------|------|----------|
| `en` | English | `es` | Spanish |
| `it` | Italian | `de` | German |
| `fr` | French | `pt` | Portuguese |
| `pl` | Polish | `nl` | Dutch |
| `ja` | Japanese | `zh` | Chinese |
| `ru` | Russian | `ar` | Arabic |

**Note:** Leave empty or omit for automatic language detection.

---

## Response Structure

### With Diarization (`diarized_json`)

When using `gpt-4o-transcribe-diarize` model with `response_format: diarized_json`:

```json
{
  "text": "Welcome to our adventure! Today we explore the ancient ruins. What do you do?",
  "language": "en",
  "duration": 45.2,
  "segments": [
    {
      "speaker": "SPEAKER_00",
      "text": "Welcome to our adventure!",
      "start": 0.0,
      "end": 2.5
    },
    {
      "speaker": "SPEAKER_00",
      "text": "Today we explore the ancient ruins.",
      "start": 2.5,
      "end": 5.8
    },
    {
      "speaker": "SPEAKER_00",
      "text": "What do you do?",
      "start": 5.8,
      "end": 7.2
    },
    {
      "speaker": "SPEAKER_01",
      "text": "I check for traps.",
      "start": 7.2,
      "end": 9.0
    }
  ]
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Full transcription text (all segments concatenated) |
| `language` | string | Detected or specified language code |
| `duration` | number | Total audio duration in seconds |
| `segments` | array | Array of transcription segments with speaker labels |

#### Segment Structure

| Field | Type | Description |
|-------|------|-------------|
| `speaker` | string | Speaker identifier (e.g., `SPEAKER_00`, `SPEAKER_01`) |
| `text` | string | Transcribed text for this segment |
| `start` | number | Start time in seconds |
| `end` | number | End time in seconds |

### Without Diarization (`json`)

When using standard JSON format without diarization:

```json
{
  "text": "Welcome to our adventure! Today we explore the ancient ruins. What do you do? I check for traps."
}
```

### Verbose JSON (`verbose_json`)

Provides additional metadata including word-level timestamps:

```json
{
  "task": "transcribe",
  "language": "en",
  "duration": 45.2,
  "text": "Welcome to our adventure!",
  "words": [
    {
      "word": "Welcome",
      "start": 0.0,
      "end": 0.5
    },
    {
      "word": "to",
      "start": 0.5,
      "end": 0.6
    }
  ]
}
```

---

## Speaker Diarization Format

### Speaker Identification

The API assigns speaker labels automatically:

- `SPEAKER_00` - First detected speaker
- `SPEAKER_01` - Second detected speaker
- `SPEAKER_02` - Third detected speaker
- ... and so on

**Important:** Speaker IDs are assigned in the order they first appear in the audio, not by any inherent speaker characteristics. The same physical speaker will consistently receive the same ID throughout a single transcription.

### Speaker Mapping in VoxChronicle

VoxChronicle provides a speaker mapping feature to convert generic speaker IDs to meaningful names:

```javascript
const speakerMap = {
  'SPEAKER_00': 'Game Master',
  'SPEAKER_01': 'Player 1 - Aldric',
  'SPEAKER_02': 'Player 2 - Syra',
  'SPEAKER_03': 'Player 3 - Thom'
};

// Apply mapping
const mappedResult = transcriptionService._mapSpeakersToNames(result, speakerMap);
```

**Mapped Result:**

```javascript
{
  text: "Welcome to our adventure! ...",
  segments: [
    {
      speaker: "Game Master",
      originalSpeaker: "SPEAKER_00",
      text: "Welcome to our adventure!",
      start: 0.0,
      end: 2.5
    },
    {
      speaker: "Player 1 - Aldric",
      originalSpeaker: "SPEAKER_01",
      text: "I check for traps.",
      start: 7.2,
      end: 9.0
    }
  ],
  speakers: [
    {
      id: "SPEAKER_00",
      name: "Game Master",
      isMapped: true
    },
    {
      id: "SPEAKER_01",
      name: "Player 1 - Aldric",
      isMapped: true
    }
  ]
}
```

### Diarization Accuracy

Speaker diarization accuracy depends on several factors:

- **Audio Quality**: Clear audio with minimal background noise improves accuracy
- **Speaker Overlap**: Simultaneous speakers may be misattributed
- **Number of Speakers**: Accuracy decreases with more speakers (optimal: 2-4 speakers)
- **Speaker Similarity**: Similar-sounding voices may be confused
- **Recording Duration**: Longer recordings generally improve speaker identification

---

## Chunking Strategy

### Why Chunking is Needed

The OpenAI transcription API has a **25MB file size limit**. For longer recording sessions (typically > 60 minutes at standard quality), audio files must be split into chunks.

### Chunking Strategy Options

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `auto` | Let OpenAI determine optimal chunking | **Recommended** - Works for most cases |
| `none` | No chunking (fail if > 25MB) | Short recordings only |

### How VoxChronicle Handles Chunking

VoxChronicle automatically detects when chunking is needed:

```javascript
import { AudioChunker, MAX_CHUNK_SIZE } from '../audio/AudioChunker.mjs';

const chunker = new AudioChunker();

if (chunker.needsChunking(audioBlob)) {
  // Audio exceeds 25MB - split into chunks
  const chunks = await chunker.splitIfNeeded(audioBlob);
  // Transcribe each chunk and combine results
} else {
  // Audio under 25MB - transcribe directly
  const result = await transcribe(audioBlob);
}
```

### Chunk Size Limits

```javascript
// Maximum file size per chunk (25MB API limit)
const MAX_TRANSCRIPTION_SIZE = 25 * 1024 * 1024; // 25MB

// VoxChronicle uses 24MB to leave 1MB margin for overhead
const MAX_CHUNK_SIZE = MAX_TRANSCRIPTION_SIZE - 1024 * 1024; // 24MB
```

### Combining Chunked Results

When audio is split into chunks, VoxChronicle:

1. Transcribes each chunk separately
2. Adjusts timestamps based on chunk duration
3. Maintains consistent speaker IDs across chunks
4. Concatenates all segments in order

```javascript
// Combined result includes metadata
{
  text: "Full transcription from all chunks...",
  segments: [ /* all segments with adjusted timestamps */ ],
  speakers: [ /* unique speakers across all chunks */ ],
  chunked: true,
  chunkCount: 3
}
```

---

## Error Handling

### Common Error Types

| Error Type | HTTP Status | Description | Solution |
|------------|-------------|-------------|----------|
| `authentication_error` | 401 | Invalid or missing API key | Check API key configuration |
| `invalid_request_error` | 400 | Invalid parameters or unsupported format | Validate audio format and parameters |
| `rate_limit_error` | 429 | Too many requests | Implement rate limiting, wait before retry |
| `api_error` | 500-599 | OpenAI server error | Retry with exponential backoff |
| `timeout_error` | - | Request timeout (default: 10 minutes) | Increase timeout or split audio |

### Error Response Format

```json
{
  "error": {
    "message": "Invalid file format. Supported formats: webm, mp3, wav, m4a, ogg, flac",
    "type": "invalid_request_error",
    "param": "file",
    "code": "invalid_file_format"
  }
}
```

### Retry Strategy

VoxChronicle implements automatic retry with exponential backoff:

```javascript
class OpenAIClient {
  constructor(apiKey, options = {}) {
    this._maxRetries = options.maxRetries ?? 3;
    this._rateLimiter = RateLimiter.fromPreset('OPENAI', {
      maxRetries: this._maxRetries
    });
  }
}
```

**Retry Logic:**

1. First failure: Wait 1 second, retry
2. Second failure: Wait 2 seconds, retry
3. Third failure: Wait 4 seconds, retry
4. After 3 retries: Throw error

---

## Cost Considerations

### Pricing

As of the latest pricing:

| Model | Cost |
|-------|------|
| `gpt-4o-transcribe-diarize` | **$0.006 per minute** of audio |
| `gpt-4o-transcribe` | **$0.006 per minute** of audio |
| `whisper-1` | **$0.006 per minute** of audio |

**Note:** Pricing is subject to change. Check [OpenAI Pricing](https://openai.com/pricing) for current rates.

### Cost Estimation

VoxChronicle provides a cost estimation method:

```javascript
const estimate = transcriptionService.estimateCost(audioBlob);
// {
//   estimatedDurationSeconds: 3600,
//   estimatedDurationMinutes: 60,
//   estimatedCostUSD: 0.36,
//   model: 'gpt-4o-transcribe-diarize',
//   pricePerMinute: 0.006
// }
```

### Cost Optimization Tips

1. **Use appropriate quality**: Don't record at unnecessarily high quality
2. **Trim silence**: Remove long periods of silence before transcription
3. **Batch processing**: Process multiple sessions together to minimize overhead
4. **Choose the right model**: Use `whisper-1` if you don't need diarization

---

## Code Examples

### Basic Transcription (No Diarization)

```javascript
import { TranscriptionService, TranscriptionModel, TranscriptionResponseFormat } from './scripts/ai/TranscriptionService.mjs';

const service = new TranscriptionService('your-api-key');

const result = await service.transcribe(audioBlob, {
  model: TranscriptionModel.WHISPER,
  responseFormat: TranscriptionResponseFormat.JSON,
  language: 'en'
});

console.log(result.text);
// "Welcome to our adventure! Today we explore the ancient ruins..."
```

### Transcription with Speaker Diarization

```javascript
const service = new TranscriptionService('your-api-key');

const result = await service.transcribe(audioBlob, {
  model: 'gpt-4o-transcribe-diarize',
  responseFormat: 'diarized_json',
  language: 'en',
  speakerMap: {
    'SPEAKER_00': 'Game Master',
    'SPEAKER_01': 'Player 1',
    'SPEAKER_02': 'Player 2'
  }
});

// Access mapped speakers
result.segments.forEach(segment => {
  console.log(`${segment.speaker}: ${segment.text}`);
  // "Game Master: Welcome to our adventure!"
  // "Game Master: What do you do?"
  // "Player 1: I check for traps."
});
```

### Using Context Prompt for Better Accuracy

```javascript
const result = await service.transcribe(audioBlob, {
  model: 'gpt-4o-transcribe-diarize',
  responseFormat: 'diarized_json',
  language: 'en',
  prompt: 'This is a D&D session. Character names: Aldric, Syra, Thom. Location: Shadowmoor Keep. NPCs: Lord Ravencroft, Mira the Wise.'
});
```

**Context prompts help with:**
- Proper nouns (character names, locations)
- Domain-specific terminology (spells, items, game mechanics)
- Uncommon words or fantasy names
- Consistent spelling across segments

### Transcription with Progress Tracking

```javascript
const result = await service.transcribe(largeAudioBlob, {
  model: 'gpt-4o-transcribe-diarize',
  responseFormat: 'diarized_json',
  onProgress: (progress) => {
    console.log(`Chunk ${progress.currentChunk}/${progress.totalChunks} - ${progress.progress}%`);
    // Update UI progress bar
  }
});
```

### Setting Default Configuration

```javascript
const service = new TranscriptionService('your-api-key', {
  defaultLanguage: 'en',
  defaultSpeakerMap: {
    'SPEAKER_00': 'Game Master',
    'SPEAKER_01': 'Player 1',
    'SPEAKER_02': 'Player 2',
    'SPEAKER_03': 'Player 3'
  },
  timeout: 600000 // 10 minutes
});

// Now all transcriptions use these defaults
const result = await service.transcribe(audioBlob);
```

### Manual Chunking for Large Files

```javascript
import { AudioChunker } from './scripts/audio/AudioChunker.mjs';

const chunker = new AudioChunker();

if (chunker.needsChunking(audioBlob)) {
  const info = chunker.getChunkingInfo(audioBlob);
  console.log(`Audio requires ${info.estimatedChunkCount} chunks`);

  const chunks = await chunker.splitIfNeeded(audioBlob);

  const results = [];
  for (const chunk of chunks) {
    const result = await service.transcribe(chunk);
    results.push(result);
  }

  // Combine results
  const combined = combineChunkResults(results);
}
```

### Error Handling Example

```javascript
import { OpenAIError, OpenAIErrorType } from './scripts/ai/OpenAIClient.mjs';

try {
  const result = await service.transcribe(audioBlob);
  console.log('Transcription successful:', result.text);
} catch (error) {
  if (error instanceof OpenAIError) {
    switch (error.type) {
      case OpenAIErrorType.AUTHENTICATION_ERROR:
        console.error('Invalid API key. Check your configuration.');
        break;
      case OpenAIErrorType.RATE_LIMIT_ERROR:
        console.error('Rate limit exceeded. Retry after:', error.retryAfter);
        break;
      case OpenAIErrorType.INVALID_REQUEST_ERROR:
        console.error('Invalid request:', error.message);
        break;
      default:
        console.error('API error:', error.message);
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

## Best Practices

### Audio Recording Quality

1. **Format**: Use WebM with Opus codec for browser recording (best compression/quality ratio)
2. **Sample Rate**: 44.1kHz or 48kHz is sufficient
3. **Channels**: Mono is adequate and reduces file size
4. **Bitrate**: 64-128 kbps is optimal for speech

### Improving Transcription Accuracy

1. **Use context prompts**: Include character names, locations, and domain-specific terms
2. **Specify language**: Don't rely on auto-detect if you know the language
3. **Clean audio**: Remove background noise and normalize volume
4. **Test speaker setup**: Verify each speaker can be heard clearly
5. **Avoid speaker overlap**: Remind players not to talk over each other

### Speaker Diarization Tips

1. **Optimal speaker count**: 2-4 speakers provides best accuracy
2. **Distinct voices**: Different genders and voice timbres improve separation
3. **Consistent positioning**: Keep microphones in fixed positions
4. **Avoid cross-talk**: Minimize simultaneous speaking
5. **Label early**: Review and label speakers soon after transcription while session is fresh

### Performance Optimization

1. **Stream when possible**: For real-time needs, consider streaming API (if available)
2. **Batch similar audio**: Process multiple sessions with same settings together
3. **Cache results**: Store transcriptions to avoid re-processing
4. **Use appropriate timeouts**: Set longer timeouts for large files
5. **Monitor rate limits**: Track API usage to avoid hitting limits

### Error Prevention

1. **Validate audio before upload**:
   ```javascript
   if (!AudioUtils.isValidAudioBlob(audioBlob)) {
     throw new Error('Invalid audio format');
   }
   ```

2. **Check file size**:
   ```javascript
   if (audioBlob.size > MAX_TRANSCRIPTION_SIZE && !enableChunking) {
     throw new Error('Audio file exceeds 25MB limit');
   }
   ```

3. **Verify API key**:
   ```javascript
   if (!apiKey || apiKey.trim() === '') {
     throw new Error('OpenAI API key is required');
   }
   ```

4. **Handle network issues**: Implement retry logic with exponential backoff

### Security Considerations

1. **Never commit API keys**: Store keys in environment variables or secure settings
2. **Client-side keys**: In Foundry VTT, use client-scoped settings for API keys
3. **Validate user input**: Sanitize any user-provided prompts or parameters
4. **Rate limiting**: Implement client-side rate limiting to avoid abuse
5. **Audit transcriptions**: Log transcription requests for troubleshooting

### Testing Strategies

1. **Use short test clips**: Create 10-20 second audio samples for testing
2. **Mock API responses**: Use test fixtures to avoid API costs during development
3. **Test error scenarios**: Verify proper handling of auth errors, timeouts, etc.
4. **Validate chunking**: Test with audio files just above 25MB threshold
5. **Verify speaker mapping**: Test with known speakers to validate accuracy

---

## Implementation in VoxChronicle

### Class: TranscriptionService

Location: `scripts/ai/TranscriptionService.mjs`

```javascript
class TranscriptionService extends OpenAIClient {
  async transcribe(audioBlob, options = {}) {
    // Validate input
    if (!AudioUtils.isValidAudioBlob(audioBlob)) {
      this._logger.warn('Audio blob may not be valid');
    }

    // Generate vocabulary prompt if not provided
    if (!options.prompt) {
      const vocabularyDict = new VocabularyDictionary();
      options.prompt = vocabularyDict.generatePrompt();
    }

    // Check if chunking is needed
    if (this._chunker.needsChunking(audioBlob)) {
      return this._transcribeChunked(audioBlob, options);
    }

    return this._transcribeSingle(audioBlob, options);
  }

  async _transcribeSingle(audioBlob, options = {}) {
    const formData = new FormData();
    const audioFile = AudioUtils.blobToFile(audioBlob, 'session');

    formData.append('file', audioFile);
    formData.append('model', options.model || 'gpt-4o-transcribe-diarize');
    formData.append('response_format', options.responseFormat || 'diarized_json');
    formData.append('chunking_strategy', 'auto');

    if (options.language) {
      formData.append('language', options.language);
    }

    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    const response = await this.postFormData('/audio/transcriptions', formData);
    return this._mapSpeakersToNames(response, options.speakerMap);
  }
}
```

### Related Files

- **OpenAIClient**: `scripts/ai/OpenAIClient.mjs` - Base API client with auth and retry logic
- **AudioChunker**: `scripts/audio/AudioChunker.mjs` - Handles audio splitting for large files
- **AudioUtils**: `scripts/utils/AudioUtils.mjs` - Audio validation and conversion utilities
- **VocabularyDictionary**: `scripts/core/VocabularyDictionary.mjs` - Generates context prompts from campaign data

---

## References

### Official Documentation

- [OpenAI Audio API](https://platform.openai.com/docs/api-reference/audio)
- [OpenAI Pricing](https://openai.com/pricing)
- [OpenAI API Keys](https://platform.openai.com/api-keys)

### VoxChronicle Documentation

- [API Reference](./API_REFERENCE.md) - Complete service API documentation
- [Architecture](./ARCHITECTURE.md) - System design and component overview
- [User Guide](./USER_GUIDE.md) - End-user instructions for using VoxChronicle

### Related Code

```javascript
// Import transcription service
import { TranscriptionService } from './scripts/ai/TranscriptionService.mjs';

// Import enums and constants
import {
  TranscriptionModel,
  TranscriptionResponseFormat,
  ChunkingStrategy
} from './scripts/ai/TranscriptionService.mjs';

// Import utilities
import { AudioChunker, MAX_CHUNK_SIZE } from './scripts/audio/AudioChunker.mjs';
import { AudioUtils, MAX_TRANSCRIPTION_SIZE } from './scripts/utils/AudioUtils.mjs';
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01 | Initial documentation for GPT-4o transcription API |

---

## Support

For issues or questions:

1. Check the [VoxChronicle README](../README.md) for general information
2. Review the [User Guide](./USER_GUIDE.md) for usage instructions
3. See [CLAUDE.md](../CLAUDE.md) for development guidance
4. Open an issue on the [GitHub repository](https://github.com/Aiacos/VoxChronicle)
