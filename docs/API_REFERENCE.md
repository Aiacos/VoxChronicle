# VoxChronicle API Reference

This document provides detailed API documentation for all service classes in the VoxChronicle module.

**Last updated:** 2026-02-19 (v2.3.7)

## Table of Contents

1. [Core Services](#core-services)
   - [VoxChronicle](#voxchronicle)
   - [Settings](#settings)
2. [Audio Services](#audio-services)
   - [AudioRecorder](#audiorecorder)
   - [AudioChunker](#audiochunker)
3. [AI Services](#ai-services)
   - [OpenAIClient](#openaiclient)
   - [TranscriptionService](#transcriptionservice)
   - [ImageGenerationService](#imagegenerationservice)
   - [EntityExtractor](#entityextractor)
   - [EmbeddingService](#embeddingservice)
   - [RAGVectorStore](#ragvectorstore)
   - [TranscriptionFactory](#transcriptionfactory)
4. [Narrator Services](#narrator-services)
   - [AIAssistant](#aiassistant)
   - [ChapterTracker](#chaptertracker)
   - [CompendiumParser](#compendiumparser)
   - [JournalParser](#journalparser)
   - [RAGRetriever](#ragretriever)
   - [RulesReference](#rulesreference)
   - [SceneDetector](#scenedetector)
   - [SessionAnalytics](#sessionanalytics)
   - [SilenceDetector](#silencedetector)
5. [Kanka Services](#kanka-services)
   - [KankaClient](#kankaclient)
   - [KankaService](#kankaservice)
   - [KankaEntityManager](#kankaentitymanager)
   - [NarrativeExporter](#narrativeexporter)
6. [Orchestration](#orchestration)
   - [SessionOrchestrator](#sessionorchestrator)
   - [TranscriptionProcessor](#transcriptionprocessor)
   - [EntityProcessor](#entityprocessor)
   - [ImageProcessor](#imageprocessor)
   - [KankaPublisher](#kankapublisher)
7. [Utilities](#utilities)
   - [Logger](#logger)
   - [RateLimiter](#ratelimiter)
   - [AudioUtils](#audioutils)
   - [CacheManager](#cachemanager)
   - [HtmlUtils](#htmlutils)
   - [DomUtils](#domutils)
   - [ErrorNotificationHelper](#errornotificationhelper)
   - [SensitiveDataFilter](#sensitivedatafilter)
8. [Type Definitions](#type-definitions)
9. [Enumerations](#enumerations)

---

## Core Services

### VoxChronicle

Main singleton class that manages all module services and session state.

**Import:**
```javascript
import { VoxChronicle } from './scripts/core/VoxChronicle.mjs';
```

#### Static Methods

##### `getInstance()`
Get the singleton instance of VoxChronicle.

```javascript
const vox = VoxChronicle.getInstance();
```

**Returns:** `VoxChronicle` - The singleton instance

##### `resetInstance()`
Reset the singleton instance (primarily for testing).

```javascript
VoxChronicle.resetInstance();
```

#### Instance Methods

##### `initialize()`
Initialize all module services. Called from the 'ready' hook.

```javascript
await VoxChronicle.getInstance().initialize();
```

**Returns:** `Promise<void>`
**Throws:** `Error` if initialization fails

##### `startRecording()`
Start a new recording session.

```javascript
await vox.startRecording();
```

**Returns:** `Promise<void>`
**Throws:** `Error` if recording cannot be started

##### `stopRecording()`
Stop the current recording session.

```javascript
const audioBlob = await vox.stopRecording();
```

**Returns:** `Promise<Blob>` - The recorded audio blob

##### `processSession(audioBlob)`
Process a completed recording session.

| Parameter | Type | Description |
|-----------|------|-------------|
| `audioBlob` | `Blob` | The recorded audio blob |

```javascript
const result = await vox.processSession(audioBlob);
// { transcript, entities, salientMoments }
```

**Returns:** `Promise<Object>` - Processed session data

##### `publishToKanka(sessionData)`
Publish a processed session to Kanka.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionData` | `Object` | The processed session data |

**Returns:** `Promise<Object>` - Created Kanka entities

##### `getServicesStatus()`
Check if all required services are configured.

```javascript
const status = vox.getServicesStatus();
// {
//   initialized: true,
//   recording: false,
//   services: { audioRecorder: true, transcription: true, ... },
//   settings: { openaiConfigured: true, kankaConfigured: true }
// }
```

**Returns:** `Object` - Status of each service

---

## Audio Services

### AudioRecorder

Audio capture service using MediaRecorder API.

**Import:**
```javascript
import { AudioRecorder, RecordingState, CaptureSource } from './scripts/audio/AudioRecorder.mjs';
```

#### Constructor

```javascript
const recorder = new AudioRecorder();
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `state` | `string` | Current recording state |
| `isRecording` | `boolean` | Whether recording is active |
| `captureSource` | `string\|null` | Active capture source |
| `duration` | `number` | Recording duration in seconds |

#### Methods

##### `startRecording(options)`
Start recording audio from the specified source.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.source` | `string` | `'microphone'` | Capture source |
| `options.echoCancellation` | `boolean` | `true` | Enable echo cancellation |
| `options.noiseSuppression` | `boolean` | `true` | Enable noise suppression |
| `options.sampleRate` | `number` | `44100` | Audio sample rate |
| `options.timeslice` | `number` | `10000` | Data chunk interval (ms) |

```javascript
await recorder.startRecording({
  source: 'microphone',
  echoCancellation: true,
  noiseSuppression: true
});
```

**Returns:** `Promise<void>`

##### `stopRecording()`
Stop recording and return the audio blob.

```javascript
const audioBlob = await recorder.stopRecording();
```

**Returns:** `Promise<Blob>` - The recorded audio

##### `pause()`
Pause the current recording.

##### `resume()`
Resume a paused recording.

##### `cancel()`
Cancel the current recording without saving.

##### `checkMicrophonePermission()`
Check microphone permission status.

```javascript
const state = await recorder.checkMicrophonePermission();
// 'granted' | 'denied' | 'prompt'
```

**Returns:** `Promise<string>` - Permission state

##### `setCallbacks(callbacks)`
Set event callback handlers.

```javascript
recorder.setCallbacks({
  onDataAvailable: (data, chunkIndex) => { ... },
  onError: (error) => { ... },
  onStateChange: (newState, oldState) => { ... }
});
```

---

### AudioChunker

Splits large audio files to comply with API size limits.

**Import:**
```javascript
import { AudioChunker, MAX_CHUNK_SIZE } from './scripts/audio/AudioChunker.mjs';
```

#### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_CHUNK_SIZE` | `25 * 1024 * 1024` | Maximum chunk size (25MB) |

#### Methods

##### `needsChunking(audioBlob)`
Check if audio needs to be chunked.

```javascript
const needsChunking = chunker.needsChunking(audioBlob);
```

**Returns:** `boolean`

##### `splitIfNeeded(audioBlob)`
Split audio blob if it exceeds size limit.

```javascript
const chunks = await chunker.splitIfNeeded(audioBlob);
```

**Returns:** `Promise<Blob[]>` - Array of audio chunks

##### `getChunkingInfo(audioBlob)`
Get information about chunking for a blob.

```javascript
const info = chunker.getChunkingInfo(audioBlob);
// { totalSizeMB, estimatedChunkCount, needsChunking }
```

---

## AI Services

### OpenAIClient

Base API client for OpenAI services.

**Import:**
```javascript
import { OpenAIClient, OpenAIError, OpenAIErrorType } from './scripts/ai/OpenAIClient.mjs';
```

#### Constructor

```javascript
const client = new OpenAIClient(apiKey, {
  baseUrl: 'https://api.openai.com/v1',
  timeout: 120000,
  maxRetries: 3
});
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `apiKey` | `string` | - | OpenAI API key |
| `options.baseUrl` | `string` | `'https://api.openai.com/v1'` | API base URL |
| `options.timeout` | `number` | `120000` | Request timeout (ms) |
| `options.maxRetries` | `number` | `3` | Max retry attempts |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `isConfigured` | `boolean` | Whether API key is set |
| `baseUrl` | `string` | API base URL |

#### Methods

##### `request(endpoint, options)`
Make a request to the OpenAI API.

```javascript
const response = await client.request('/chat/completions', {
  method: 'POST',
  body: JSON.stringify({ ... })
});
```

**Returns:** `Promise<Object>` - Parsed JSON response
**Throws:** `OpenAIError`

##### `post(endpoint, data)`
Make a POST request with JSON body.

```javascript
const response = await client.post('/chat/completions', {
  model: 'gpt-4o',
  messages: [...]
});
```

##### `postFormData(endpoint, formData)`
Make a POST request with FormData body (for file uploads).

```javascript
const formData = new FormData();
formData.append('file', audioBlob, 'audio.webm');
const response = await client.postFormData('/audio/transcriptions', formData);
```

##### `validateApiKey()`
Validate the API key by making a test request.

```javascript
const isValid = await client.validateApiKey();
```

**Returns:** `Promise<boolean>`

##### `getRateLimiterStats()`
Get rate limiter statistics.

**Returns:** `Object` - Rate limiter stats

---

### TranscriptionService

Audio transcription with speaker diarization.

**Import:**
```javascript
import {
  TranscriptionService,
  TranscriptionModel,
  TranscriptionResponseFormat
} from './scripts/ai/TranscriptionService.mjs';
```

#### Constructor

```javascript
const transcription = new TranscriptionService(apiKey, {
  defaultLanguage: 'en',
  defaultSpeakerMap: { 'SPEAKER_00': 'GM' },
  timeout: 600000
});
```

> 📖 **Detailed Documentation:** For comprehensive information about the GPT-4o transcription API with speaker diarization, including response formats, error handling, and best practices, see [GPT4O_TRANSCRIBE_API.md](./GPT4O_TRANSCRIBE_API.md).

#### Methods

##### `transcribe(audioBlob, options)`
Transcribe audio with speaker diarization.

| Parameter | Type | Description |
|-----------|------|-------------|
| `audioBlob` | `Blob` | Audio file to transcribe |
| `options.speakerMap` | `Object` | Speaker ID to name mapping |
| `options.language` | `string` | ISO language code |
| `options.model` | `string` | Transcription model |
| `options.prompt` | `string` | Context prompt |
| `options.onProgress` | `Function` | Progress callback |

```javascript
const result = await transcription.transcribe(audioBlob, {
  speakerMap: { 'SPEAKER_00': 'Game Master', 'SPEAKER_01': 'Player 1' },
  language: 'en',
  onProgress: ({ progress, currentChunk, totalChunks }) => {
    console.log(`Progress: ${progress}%`);
  }
});
```

**Returns:** `Promise<TranscriptionResult>`

##### `setSpeakerMap(speakerMap)`
Set the default speaker mapping.

```javascript
transcription.setSpeakerMap({
  'SPEAKER_00': 'Game Master',
  'SPEAKER_01': 'Player 1'
});
```

##### `setLanguage(language)`
Set the default transcription language.

```javascript
transcription.setLanguage('it'); // Italian
```

##### `transcribeBasic(audioBlob, language)`
Transcribe without diarization (faster, cheaper).

```javascript
const result = await transcription.transcribeBasic(audioBlob, 'en');
```

##### `estimateCost(audioBlob, model)`
Estimate transcription cost.

```javascript
const estimate = transcription.estimateCost(audioBlob);
// { estimatedDurationMinutes, estimatedCostUSD, ... }
```

#### Static Methods

##### `getSupportedLanguages()`
Get list of supported languages.

**Returns:** `Array<{code: string, name: string}>`

##### `getAvailableModels()`
Get available transcription models.

**Returns:** `Array<Object>`

---

### ImageGenerationService

gpt-image-1 image generation for entities and scenes. Returns base64 data (NOT URLs).

**Import:**
```javascript
import {
  ImageGenerationService,
  ImageModel,
  ImageSize,
  ImageQuality,
  ImageStyle,
  EntityType
} from './scripts/ai/ImageGenerationService.mjs';
```

#### Constructor

```javascript
const imageGen = new ImageGenerationService(apiKey, {
  quality: 'standard',
  style: 'vivid',
  campaignStyle: 'dark fantasy'
});
```

#### Methods

##### `generatePortrait(entityType, description, options)`
Generate an image for an entity.

| Parameter | Type | Description |
|-----------|------|-------------|
| `entityType` | `string` | Type: 'character', 'location', 'item', 'scene' |
| `description` | `string` | Description of what to generate |
| `options.size` | `string` | Image size |
| `options.quality` | `string` | 'standard' or 'hd' |
| `options.style` | `string` | 'vivid' or 'natural' |

```javascript
const result = await imageGen.generatePortrait('character',
  'A grizzled dwarf warrior with a braided beard',
  { quality: 'hd', style: 'vivid' }
);
// { url, revisedPrompt, entityType, expiresAt, ... }
```

**Returns:** `Promise<ImageGenerationResult>`

> ⚠️ **Important:** Image URLs expire in 60 minutes! Download immediately.

##### `generateCharacterPortrait(description, options)`
Generate a character portrait.

```javascript
const result = await imageGen.generateCharacterPortrait(
  'An elven mage in flowing robes'
);
```

##### `generateLocationImage(description, options)`
Generate a location illustration.

```javascript
const result = await imageGen.generateLocationImage(
  'A mysterious tavern at a crossroads'
);
```

##### `generateSceneImage(description, options)`
Generate a dramatic scene illustration.

```javascript
const result = await imageGen.generateSceneImage(
  'The party faces a dragon in its lair'
);
```

##### `generateBatch(requests, onProgress)`
Generate multiple images in batch.

```javascript
const results = await imageGen.generateBatch([
  { entityType: 'character', description: 'A brave knight' },
  { entityType: 'location', description: 'A dark forest' }
], (progress) => {
  console.log(`${progress.current}/${progress.total}`);
});
```

##### `downloadImage(url)`
Download an image before URL expires.

```javascript
const blob = await imageGen.downloadImage(result.url);
```

**Returns:** `Promise<Blob>`

##### `isUrlValid(result)`
Check if an image URL is still valid.

```javascript
if (!imageGen.isUrlValid(result)) {
  // URL has expired, regenerate image
}
```

##### `setCampaignStyle(style)`
Set campaign style for consistent aesthetics.

```javascript
imageGen.setCampaignStyle('steampunk');
```

##### `estimateCost(quality, size)`
Estimate generation cost.

```javascript
const cost = imageGen.estimateCost('medium', '1024x1024');
// { estimatedCostUSD: 0.02, ... }
```

> **Note:** gpt-image-1 uses quality levels `low`, `medium`, `high` (not `standard`/`hd` like DALL-E 3).

#### Static Methods

##### `getAvailableSizes()`
Get available image sizes.

##### `getAvailableQualities()`
Get quality options.

##### `getEntityTypes()`
Get entity type options.

---

### EntityExtractor

AI-powered entity extraction from transcripts.

**Import:**
```javascript
import {
  EntityExtractor,
  ExtractedEntityType,
  CharacterType
} from './scripts/ai/EntityExtractor.mjs';
```

#### Constructor

```javascript
const extractor = new EntityExtractor(apiKey, {
  model: 'gpt-4o',
  extractionTemperature: 0.3,
  momentTemperature: 0.7,
  knownEntities: ['Gandalf', 'Mordor']
});
```

#### Methods

##### `extractEntities(transcriptText, options)`
Extract entities from transcription text.

| Parameter | Type | Description |
|-----------|------|-------------|
| `transcriptText` | `string` | Full transcription text |
| `options.existingEntities` | `string[]` | Names to exclude |
| `options.includePlayerCharacters` | `boolean` | Include PCs |
| `options.campaignContext` | `string` | Campaign context |

```javascript
const result = await extractor.extractEntities(transcriptText, {
  existingEntities: ['Gandalf', 'Bilbo'],
  includePlayerCharacters: false
});
// {
//   characters: [{ name, description, isNPC, role }],
//   locations: [{ name, description, type }],
//   items: [{ name, description, type }],
//   totalCount
// }
```

**Returns:** `Promise<ExtractionResult>`

##### `identifySalientMoments(transcriptText, options)`
Identify dramatic moments for image generation.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `transcriptText` | `string` | - | Full transcription |
| `options.maxMoments` | `number` | `3` | Max moments |
| `options.style` | `string` | - | Visual style preference |

```javascript
const moments = await extractor.identifySalientMoments(transcriptText, {
  maxMoments: 5
});
// [{ title, imagePrompt, context, dramaScore }]
```

**Returns:** `Promise<SalientMoment[]>`

##### `extractAll(transcriptText, options)`
Extract both entities and salient moments.

```javascript
const result = await extractor.extractAll(transcriptText);
// { characters, locations, items, moments }
```

##### `addKnownEntities(names)`
Add known entities to avoid duplicates.

```javascript
extractor.addKnownEntities(['Gandalf', 'Frodo']);
```

##### `clearKnownEntities()`
Clear all known entities.

##### `estimateCost(transcriptText)`
Estimate extraction cost.

```javascript
const cost = extractor.estimateCost(transcriptText);
// { estimatedTokens, estimatedCostUSD }
```

---

### RAGProvider (Abstract)

Abstract base class defining the RAG provider interface. All providers extend this class.

**Import:**
```javascript
import { RAGProvider } from './scripts/rag/RAGProvider.mjs';
```

#### Methods (all abstract — must be implemented by subclasses)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `initialize(config)` | `{campaignId?, model?}` | `Promise<void>` | Set up provider resources |
| `destroy()` | — | `Promise<void>` | Clean up resources (idempotent) |
| `indexDocuments(documents)` | `RAGDocument[]` | `Promise<{indexed, failed}>` | Upload and index documents |
| `removeDocument(documentId)` | `string` | `Promise<boolean>` | Remove a single document |
| `clearIndex()` | — | `Promise<void>` | Remove all documents |
| `query(question, options)` | `string, {maxResults?}` | `Promise<{answer, sources}>` | Query the RAG index |
| `getStatus()` | — | `Promise<{ready, documentCount, providerName}>` | Get provider status |

#### RAGDocument Format

```javascript
{ id: 'doc-1', title: 'Session 1', content: '...', metadata: { type: 'journal' } }
```

---

### RAGProviderFactory

Factory for creating RAG provider instances by type.

**Import:**
```javascript
import { RAGProviderFactory } from './scripts/rag/RAGProviderFactory.mjs';
```

#### Static Methods

```javascript
const provider = RAGProviderFactory.create('openai-file-search', { apiKey, campaignId });
const provider = RAGProviderFactory.create('ragflow', { baseUrl, apiKey });
RAGProviderFactory.register('custom', CustomProvider); // Register new provider
RAGProviderFactory.getAvailableProviders(); // ['openai-file-search', 'ragflow']
```

---

### OpenAIFileSearchProvider

Default RAG provider using OpenAI Responses API + `file_search` tool.

**Import:**
```javascript
import { OpenAIFileSearchProvider } from './scripts/rag/OpenAIFileSearchProvider.mjs';
```

Features: auto-chunking (800-token windows), hosted vector store, built-in reranking, 30-day expiry with auto-recreate.

---

### RAGFlowProvider

Alternative RAG provider for self-hosted RAGFlow instances.

**Import:**
```javascript
import { RAGFlowProvider } from './scripts/rag/RAGFlowProvider.mjs';
```

Features: dataset management, document upload with parsing status polling, OpenAI-compatible chat completions, Bearer token auth.

---

### TranscriptionFactory

Factory for creating appropriate transcription service based on mode setting.

**Import:**
```javascript
import { TranscriptionFactory } from './scripts/ai/TranscriptionFactory.mjs';
```

#### Static Methods

##### `create(mode, apiKey, options)`
Create a transcription service based on mode.

```javascript
const service = TranscriptionFactory.create('auto', apiKey, {
  whisperUrl: 'http://localhost:8080'
});
```

| Mode | Description |
|------|-------------|
| `'api'` | OpenAI cloud transcription only |
| `'local'` | Local Whisper backend only |
| `'auto'` | Try local first, fallback to cloud |

---

## Narrator Services

Real-time DM assistant services for Live Mode. These services are activated when the user starts a live session and provide contextual AI assistance during gameplay.

### AIAssistant

Contextual AI suggestions with RAG context injection.

**Import:**
```javascript
import { AIAssistant } from './scripts/narrator/AIAssistant.mjs';
```

#### Constructor

```javascript
const assistant = new AIAssistant(openAIClient, {
  model: 'gpt-4o-mini',
  ragRetriever: ragRetrieverInstance
});
```

#### Methods

##### `analyzeContext(context)`
Generate suggestions and detect off-track situations in a single API call.

```javascript
const result = await assistant.analyzeContext({
  transcript: 'recent transcript text...',
  sceneType: 'combat',
  chapter: { title: 'Chapter 3', summary: '...' },
  characters: ['Thorn', 'Elara']
});
// {
//   suggestions: [{ type: 'narration'|'dialogue'|'action'|'reference', content: '...' }],
//   offTrack: { detected: true, bridge: 'The tavern keeper clears his throat...' }
// }
```

##### `generateSuggestions(context)`
Generate contextual suggestions only.

##### `detectOffTrack(transcript)`
Detect if players are going off-track from the adventure.

##### `setAdventureContext(adventureText)`
Set the full adventure text for context-aware suggestions.

##### `setChapterContext(chapter)`
Set the current chapter for focused suggestions.

---

### ChapterTracker

Track current chapter/scene from Foundry journal entries.

**Import:**
```javascript
import { ChapterTracker } from './scripts/narrator/ChapterTracker.mjs';
```

#### Methods

##### `loadFromJournal(journalEntry)`
Parse a Foundry journal entry into chapters.

##### `getCurrentChapter()`
Get the current active chapter.

```javascript
const chapter = tracker.getCurrentChapter();
// { title: 'Chapter 3: The Dark Forest', summary: '...', pages: [...] }
```

##### `update(transcriptText)`
Update chapter tracking based on latest transcript content.

---

### CompendiumParser

Parse Foundry compendiums for rules content and text chunking for RAG.

**Import:**
```javascript
import { CompendiumParser } from './scripts/narrator/CompendiumParser.mjs';
```

#### Methods

##### `parseCompendium(pack)`
Parse a Foundry compendium pack into searchable text chunks.

```javascript
const chunks = await parser.parseCompendium(game.packs.get('dnd5e.rules'));
// [{ id, title, content, source, tokens }]
```

##### `parseAllCompendiums(packIds)`
Parse multiple compendiums.

---

### JournalParser

Parse Foundry journal entries for story context and text chunking for RAG.

**Import:**
```javascript
import { JournalParser } from './scripts/narrator/JournalParser.mjs';
```

#### Methods

##### `parseJournal(journalEntry)`
Parse a single Foundry journal entry into text chunks.

```javascript
const chunks = await parser.parseJournal(game.journal.get(journalId));
// [{ id, title, content, pageId, tokens }]
```

##### `parseAllJournals(journalIds)`
Parse multiple journals.

---

### RAGRetriever

Hybrid semantic + keyword retrieval with configurable scoring weights.

**Import:**
```javascript
import { RAGRetriever } from './scripts/narrator/RAGRetriever.mjs';
```

#### Constructor

```javascript
const retriever = new RAGRetriever(embeddingService, vectorStore, {
  semanticWeight: 0.7,
  keywordWeight: 0.2,
  recencyWeight: 0.1,
  maxResults: 5,
  similarityThreshold: 0.3
});
```

#### Methods

##### `retrieveContext(query, options)`
Retrieve relevant context for a query using hybrid scoring.

```javascript
const results = await retriever.retrieveContext('What are the rules for grappling?', {
  maxResults: 3
});
// [{ content, title, score, source }]
```

##### `buildIndex(journalIds, packIds, options)`
Build the RAG index from journals and compendiums.

```javascript
await retriever.buildIndex(
  ['journal-id-1', 'journal-id-2'],
  ['dnd5e.rules'],
  { onProgress: (progress) => console.log(progress) }
);
```

##### `getIndexStatus()`
Get index status.

```javascript
const status = retriever.getIndexStatus();
// { vectorCount, ready, lastBuilt }
```

##### `clearIndex()`
Clear the entire RAG index.

---

### RulesReference

D&D rules Q&A with compendium citations.

**Import:**
```javascript
import { RulesReference } from './scripts/narrator/RulesReference.mjs';
```

#### Methods

##### `lookupRule(question)`
Look up a rule and provide an answer with citations.

```javascript
const result = await rulesRef.lookupRule('How does opportunity attack work?');
// { answer: '...', citations: [{ source, page, excerpt }] }
```

---

### SceneDetector

Detect scene type from transcript content.

**Import:**
```javascript
import { SceneDetector } from './scripts/narrator/SceneDetector.mjs';
```

#### Methods

##### `detectSceneTransition(transcript)`
Detect the current scene type and any transitions.

```javascript
const scene = await detector.detectSceneTransition(recentTranscript);
// { type: 'combat'|'social'|'exploration'|'rest', confidence: 0.85, transition: true }
```

---

### SessionAnalytics

Speaker participation, timeline, and session statistics.

**Import:**
```javascript
import { SessionAnalytics } from './scripts/narrator/SessionAnalytics.mjs';
```

#### Methods

##### `addSegment(segment)`
Add a transcript segment to analytics tracking.

```javascript
analytics.addSegment({ speaker: 'Game Master', text: '...', start: 0, end: 5.2 });
```

##### `getStats()`
Get session statistics.

```javascript
const stats = analytics.getStats();
// {
//   totalDuration, speakerBreakdown: { 'GM': { segments, duration, percentage } },
//   timeline: [...], silenceDuration
// }
```

---

### SilenceDetector

Timer-based silence detection for auto-triggering AI suggestions.

**Import:**
```javascript
import { SilenceDetector } from './scripts/narrator/SilenceDetector.mjs';
```

#### Constructor

```javascript
const detector = new SilenceDetector({
  silenceThreshold: 30000, // 30 seconds
  onSilenceDetected: () => { /* trigger AI suggestion */ }
});
```

#### Methods

##### `start()`
Start silence monitoring.

##### `reset()`
Reset the silence timer (call when new speech is detected).

##### `stop()`
Stop silence monitoring.

---

## Kanka Services

### KankaClient

Base API client for Kanka.io services.

**Import:**
```javascript
import { KankaClient, KankaError, KankaErrorType } from './scripts/kanka/KankaClient.mjs';
```

#### Constructor

```javascript
const client = new KankaClient(apiToken, {
  timeout: 30000,
  maxRetries: 3,
  isPremium: false  // Affects rate limits
});
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `apiToken` | `string` | - | Kanka API token |
| `options.isPremium` | `boolean` | `false` | Premium tier (90 vs 30 req/min) |
| `options.timeout` | `number` | `30000` | Request timeout (ms) |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `isConfigured` | `boolean` | Whether token is set |
| `isPremium` | `boolean` | Premium tier status |
| `remainingRequests` | `number` | Remaining rate limit |
| `isRateLimited` | `boolean` | Currently rate limited |

#### Methods

##### `request(endpoint, options)`
Make a request to the Kanka API.

```javascript
const response = await client.request('/campaigns', { method: 'GET' });
```

##### `get(endpoint)`
Make a GET request.

##### `post(endpoint, data)`
Make a POST request.

##### `put(endpoint, data)`
Make a PUT request.

##### `patch(endpoint, data)`
Make a PATCH request.

##### `delete(endpoint)`
Make a DELETE request.

##### `postFormData(endpoint, formData)`
Upload files with FormData.

##### `validateApiToken()`
Validate the API token.

**Returns:** `Promise<boolean>`

##### `setPremiumStatus(isPremium)`
Update premium status and rate limits.

```javascript
client.setPremiumStatus(true);
```

---

### KankaService

High-level entity CRUD operations for Kanka.

**Import:**
```javascript
import {
  KankaService,
  KankaEntityType,
  CharacterType,
  LocationType,
  ItemType
} from './scripts/kanka/KankaService.mjs';
```

#### Constructor

```javascript
const kanka = new KankaService(apiToken, campaignId, {
  isPremium: true
});
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `isFullyConfigured` | `boolean` | Token and campaign set |
| `campaignId` | `string` | Current campaign ID |

#### Campaign Methods

##### `listCampaigns()`
Get accessible campaigns.

```javascript
const campaigns = await kanka.listCampaigns();
```

##### `getCampaign(campaignId)`
Get campaign details.

#### Journal Methods (Session Chronicles)

##### `createJournal(journalData)`
Create a new journal entry.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `journalData.name` | `string` | Yes | Journal title |
| `journalData.entry` | `string` | No | HTML content |
| `journalData.type` | `string` | No | Journal type |
| `journalData.date` | `string` | No | Date (YYYY-MM-DD) |
| `journalData.is_private` | `boolean` | No | Private flag |

```javascript
const journal = await kanka.createJournal({
  name: 'Session 1 Chronicle',
  entry: '<h2>Summary</h2><p>The party...</p>',
  type: 'Session Chronicle',
  date: '2024-01-15'
});
```

**Returns:** `Promise<Object>` - Created journal

##### `getJournal(journalId)`
Get a journal by ID.

##### `updateJournal(journalId, journalData)`
Update a journal.

##### `deleteJournal(journalId)`
Delete a journal.

##### `listJournals(options)`
List journals with pagination.

```javascript
const result = await kanka.listJournals({ page: 1, type: 'Session Chronicle' });
// { data: [...], meta: {...}, links: {...} }
```

#### Character Methods

##### `createCharacter(characterData)`
Create a new character.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `characterData.name` | `string` | Yes | Character name |
| `characterData.entry` | `string` | No | Description |
| `characterData.type` | `string` | No | 'NPC', 'PC', etc. |
| `characterData.title` | `string` | No | Title/role |
| `characterData.is_dead` | `boolean` | No | Dead status |

```javascript
const character = await kanka.createCharacter({
  name: 'Thorn the Merchant',
  entry: 'A shrewd trader from the southern lands.',
  type: 'NPC',
  title: 'Merchant'
});
```

##### `getCharacter(characterId)`
##### `updateCharacter(characterId, characterData)`
##### `deleteCharacter(characterId)`
##### `listCharacters(options)`

#### Location Methods

##### `createLocation(locationData)`
Create a new location.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `locationData.name` | `string` | Yes | Location name |
| `locationData.entry` | `string` | No | Description |
| `locationData.type` | `string` | No | 'City', 'Dungeon', etc. |
| `locationData.parent_location_id` | `number` | No | Parent location |

```javascript
const location = await kanka.createLocation({
  name: 'The Silver Dragon Inn',
  entry: 'A cozy tavern at the crossroads.',
  type: 'Tavern'
});
```

##### `getLocation(locationId)`
##### `updateLocation(locationId, locationData)`
##### `deleteLocation(locationId)`
##### `listLocations(options)`

#### Item Methods

##### `createItem(itemData)`
Create a new item.

```javascript
const item = await kanka.createItem({
  name: 'Blade of Dawn',
  entry: 'An ancient sword that glows in darkness.',
  type: 'Weapon'
});
```

##### `getItem(itemId)`
##### `updateItem(itemId, itemData)`
##### `deleteItem(itemId)`
##### `listItems(options)`

#### Image Upload Methods

##### `uploadImage(entityType, entityId, imageSource, options)`
Upload an image to an entity.

| Parameter | Type | Description |
|-----------|------|-------------|
| `entityType` | `string` | Entity type from KankaEntityType |
| `entityId` | `number` | Entity ID |
| `imageSource` | `string\|Blob` | Image URL or Blob |
| `options.filename` | `string` | Filename for upload |

```javascript
// Upload from URL (will download first)
await kanka.uploadImage('characters', 123, 'https://...');

// Upload from Blob
await kanka.uploadImage('characters', 123, imageBlob);
```

> ⚠️ **Important:** Download OpenAI image URLs before they expire (60 minutes)!

##### `uploadCharacterImage(characterId, imageSource, options)`
##### `uploadLocationImage(locationId, imageSource, options)`
##### `uploadItemImage(itemId, imageSource, options)`
##### `uploadJournalImage(journalId, imageSource, options)`

#### Utility Methods

##### `searchEntities(query, entityType)`
Search for entities by name.

```javascript
const results = await kanka.searchEntities('Thorn');
```

##### `findExistingEntity(name, entityType)`
Check if entity exists (case-insensitive).

```javascript
const existing = await kanka.findExistingEntity('Thorn', 'characters');
```

##### `createIfNotExists(entityType, entityData)`
Create entity only if it doesn't exist.

```javascript
const entity = await kanka.createIfNotExists('characters', {
  name: 'Thorn',
  entry: 'A merchant'
});
// Returns existing entity with _alreadyExisted: true if found
```

##### `batchCreate(entityType, entitiesData, options)`
Batch create multiple entities.

```javascript
const results = await kanka.batchCreate('characters',
  [{ name: 'NPC 1' }, { name: 'NPC 2' }],
  {
    skipExisting: true,
    onProgress: (current, total, entity) => { ... }
  }
);
```

---

### NarrativeExporter

Format transcripts as Kanka journal entries.

**Import:**
```javascript
import {
  NarrativeExporter,
  ChronicleFormat,
  FormattingStyle
} from './scripts/kanka/NarrativeExporter.mjs';
```

#### Constructor

```javascript
const exporter = new NarrativeExporter({
  campaignName: 'My Campaign',
  defaultStyle: 'rich',
  defaultFormat: 'full',
  openAIApiKey: '...'  // Optional, for AI summaries
});
```

#### Methods

##### `formatChronicle(sessionData, options)`
Format a complete chronicle from session data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionData.title` | `string` | Chronicle title |
| `sessionData.date` | `string` | Session date |
| `sessionData.segments` | `Array` | Transcript segments |
| `sessionData.entities` | `Object` | Extracted entities |
| `sessionData.moments` | `Array` | Salient moments |
| `options.format` | `string` | 'transcript', 'narrative', 'summary', 'full' |
| `options.style` | `string` | 'minimal', 'rich', 'markdown' |

```javascript
const chronicle = exporter.formatChronicle({
  title: 'Session 1',
  date: '2024-01-15',
  segments: transcriptResult.segments,
  entities: extractedEntities,
  moments: salientMoments
}, {
  format: 'full',
  style: 'rich',
  includeTimestamps: false
});
// { name, entry, type, date, is_private, meta }
```

**Returns:** `ChronicleResult`

##### `generateSummary(segments, options)`
Generate a basic summary from segments.

```javascript
const summary = exporter.generateSummary(segments, {
  maxLength: 500,
  includeSpeakers: true
});
```

##### `generateAISummary(segments, options)`
Generate an AI-enhanced narrative summary.

```javascript
const result = await exporter.generateAISummary(segments, {
  maxLength: 1000,
  style: 'narrative',  // 'narrative', 'bullet', 'formal'
  campaignContext: 'High fantasy adventure'
});
// { summary, success, model, style, ... }
```

**Returns:** `Promise<AISummaryResult>`

##### `export(sessionData, options)`
Export to Kanka journal format.

```javascript
const journalData = exporter.export(sessionData, {
  location_id: 123,
  tags: [1, 2, 3]
});
// Ready for KankaService.createJournal()
```

##### `formatTranscript(segments, options)`
Format segments as readable dialogue.

```javascript
const formatted = exporter.formatTranscript(segments, {
  includeTimestamps: true,
  groupBySpeaker: true
});
```

##### `setCampaignName(name)`
Set campaign name for headers.

##### `setDefaultStyle(style)`
Set default formatting style.

##### `setDefaultFormat(format)`
Set default chronicle format.

##### `isAISummaryEnabled()`
Check if AI summaries are available.

---

### KankaEntityManager

Entity lifecycle management with caching and batch operations.

**Import:**
```javascript
import { KankaEntityManager } from './scripts/kanka/KankaEntityManager.mjs';
```

#### Methods

##### `createEntities(entities, options)`
Create multiple entities with duplicate checking and caching.

```javascript
const results = await manager.createEntities({
  characters: [{ name: 'Thorn', entry: '...' }],
  locations: [{ name: 'Silver Inn', entry: '...' }]
}, { onProgress: (current, total) => { ... } });
```

##### `preFetchEntities()`
Pre-fetch all entity types into cache for bulk operations.

##### `clearCache(entityType)`
Clear entity cache for a specific type or all types.

---

## Orchestration

### SessionOrchestrator

Manages the complete session workflow.

**Import:**
```javascript
import {
  SessionOrchestrator,
  SessionState,
  DEFAULT_SESSION_OPTIONS
} from './scripts/orchestration/SessionOrchestrator.mjs';
```

#### Constructor

```javascript
const orchestrator = new SessionOrchestrator({
  audioRecorder,
  transcriptionService,
  entityExtractor,
  imageGenerationService,
  kankaService,
  narrativeExporter
}, {
  autoExtractEntities: true,
  autoGenerateImages: true,
  autoPublishToKanka: false,
  maxImagesPerSession: 5
});
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `state` | `string` | Current state from SessionState |
| `isSessionActive` | `boolean` | Session is active |
| `isRecording` | `boolean` | Recording in progress |
| `currentSession` | `SessionData` | Current session data |

#### Methods

##### `startSession(sessionOptions)`
Start a new recording session.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionOptions.title` | `string` | Session title |
| `sessionOptions.date` | `string` | Session date |
| `sessionOptions.speakerMap` | `Object` | Speaker mapping |
| `sessionOptions.language` | `string` | Transcription language |
| `sessionOptions.recordingOptions` | `Object` | Audio options |

```javascript
await orchestrator.startSession({
  title: 'Session 5 - The Dark Tower',
  speakerMap: { 'SPEAKER_00': 'GM', 'SPEAKER_01': 'Player 1' },
  language: 'en'
});
```

##### `stopSession(options)`
Stop recording and process.

```javascript
const sessionData = await orchestrator.stopSession({
  processImmediately: true
});
```

**Returns:** `Promise<SessionData>`

##### `pauseRecording()`
Pause the recording.

##### `resumeRecording()`
Resume the recording.

##### `cancelSession()`
Cancel without saving.

##### `processTranscription(options)`
Process transcription manually.

```javascript
const transcript = await orchestrator.processTranscription({
  speakerMap: { ... }
});
```

##### `publishToKanka(options)`
Publish session to Kanka.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.createEntities` | `boolean` | `true` | Create entities |
| `options.uploadImages` | `boolean` | `true` | Upload images |
| `options.createChronicle` | `boolean` | `true` | Create journal |

```javascript
const results = await orchestrator.publishToKanka({
  createEntities: true,
  uploadImages: true,
  createChronicle: true
});
// { journal, characters, locations, items, images, errors }
```

**Returns:** `Promise<KankaPublishResult>`

##### `setCallbacks(callbacks)`
Set event callbacks.

```javascript
orchestrator.setCallbacks({
  onStateChange: (newState, oldState, data) => { ... },
  onProgress: ({ stage, progress, message }) => { ... },
  onError: (error, stage) => { ... },
  onSessionComplete: (sessionData) => { ... }
});
```

##### `getServicesStatus()`
Check service configuration status.

```javascript
const status = orchestrator.getServicesStatus();
// {
//   audioRecorder: true,
//   transcriptionService: true,
//   canRecord: true,
//   canTranscribe: true,
//   canPublish: true
// }
```

##### `getSessionSummary()`
Get summary of current session.

```javascript
const summary = orchestrator.getSessionSummary();
// {
//   id, title, date, state, duration,
//   hasAudio, hasTranscript, segmentCount,
//   entityCount, momentCount, imageCount, hasChronicle
// }
```

##### `reset()`
Reset to idle state.

---

### TranscriptionProcessor

Audio transcription workflow with auto-fallback between cloud and local.

**Import:**
```javascript
import { TranscriptionProcessor } from './scripts/orchestration/TranscriptionProcessor.mjs';
```

#### Methods

##### `process(audioBlob, options)`
Process audio blob into a transcript.

```javascript
const transcript = await processor.process(audioBlob, {
  speakerMap, language, onProgress
});
```

---

### EntityProcessor

Entity extraction workflow from transcript text.

**Import:**
```javascript
import { EntityProcessor } from './scripts/orchestration/EntityProcessor.mjs';
```

#### Methods

##### `process(transcript, options)`
Extract entities from transcript.

---

### ImageProcessor

Image generation workflow for entities and moments.

**Import:**
```javascript
import { ImageProcessor } from './scripts/orchestration/ImageProcessor.mjs';
```

#### Methods

##### `process(entities, moments, options)`
Generate images for entities and salient moments.

---

### KankaPublisher

Kanka publishing workflow — journals, entities, and images.

**Import:**
```javascript
import { KankaPublisher } from './scripts/orchestration/KankaPublisher.mjs';
```

#### Methods

##### `publish(sessionData, options)`
Publish a complete session to Kanka.

```javascript
const results = await publisher.publish(sessionData, {
  createEntities: true,
  uploadImages: true,
  createChronicle: true,
  onProgress
});
// { journal, characters, locations, items, images, errors }
```

---

## Utilities

### Logger

Module-prefixed console logging utility.

**Import:**
```javascript
import { Logger, LogLevel } from './scripts/utils/Logger.mjs';
```

#### Static Methods

##### `setLogLevel(level)`
Set minimum log level.

```javascript
Logger.setLogLevel(LogLevel.DEBUG);
```

##### `setDebugEnabled(enabled)`
Enable debug mode.

```javascript
Logger.setDebugEnabled(true);
```

##### `log(...args)`, `info(...args)`, `warn(...args)`, `error(...args)`, `debug(...args)`
Log messages at different levels.

```javascript
Logger.log('Session started');
Logger.error('Failed to connect:', error);
```

##### `group(label, collapsed)`, `groupEnd()`
Create collapsible console groups.

##### `time(label)`, `timeEnd(label)`
Performance timing.

```javascript
Logger.time('transcription');
// ... work ...
Logger.timeEnd('transcription'); // "transcription: 1234.56ms"
```

##### `createChild(subModule)`
Create a child logger with prefix.

```javascript
const logger = Logger.createChild('AudioRecorder');
logger.log('Recording started'); // "vox-chronicle:AudioRecorder | Recording started"
```

**Returns:** `Object` - Logger methods with sub-module prefix

---

### RateLimiter

API request throttling with queue management.

**Import:**
```javascript
import { RateLimiter, RateLimitPresets } from './scripts/utils/RateLimiter.mjs';
```

#### Constructor

```javascript
const limiter = new RateLimiter({
  requestsPerMinute: 30,
  maxQueueSize: 100,
  maxRetries: 3,
  initialBackoffMs: 1000,
  name: 'Kanka'
});
```

#### Static Methods

##### `fromPreset(presetName, overrides)`
Create from a preset.

```javascript
const limiter = RateLimiter.fromPreset('KANKA_FREE');
const premiumLimiter = RateLimiter.fromPreset('KANKA_PREMIUM');
```

Available presets: `KANKA_FREE` (30/min), `KANKA_PREMIUM` (90/min), `OPENAI` (60/min)

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `queueLength` | `number` | Pending requests |
| `currentWindowRequests` | `number` | Requests in current window |
| `remainingRequests` | `number` | Available slots |
| `isPaused` | `boolean` | Paused due to rate limit |

#### Methods

##### `throttle(fn)`
Throttle an async function call.

```javascript
const result = await limiter.throttle(async () => {
  return await fetch(url);
});
```

##### `executeWithRetry(fn, maxRetries)`
Execute with automatic retry on rate limit.

```javascript
const result = await limiter.executeWithRetry(async () => {
  return await api.request('/endpoint');
});
```

##### `pause(durationMs)`
Pause the limiter (e.g., after 429 response).

```javascript
limiter.pause(60000); // Pause for 1 minute
```

##### `resume()`
Resume from pause.

##### `waitForSlot()`
Wait until a request slot is available.

##### `clear(error)`
Clear the request queue.

##### `reset()`
Reset all state.

##### `getStats()`
Get limiter statistics.

```javascript
const stats = limiter.getStats();
// { name, requestsPerMinute, remainingRequests, queueLength, isPaused }
```

---

### AudioUtils

Audio blob handling utilities.

**Import:**
```javascript
import { AudioUtils } from './scripts/utils/AudioUtils.mjs';
```

#### Static Methods

##### `isValidAudioBlob(blob)`
Check if blob is valid audio.

```javascript
const isValid = AudioUtils.isValidAudioBlob(blob);
```

##### `getBlobSizeMB(blob)`
Get blob size in megabytes.

```javascript
const sizeMB = AudioUtils.getBlobSizeMB(audioBlob);
```

##### `getSupportedMimeType()`
Get best supported MIME type.

```javascript
const mimeType = AudioUtils.getSupportedMimeType();
// 'audio/webm;codecs=opus'
```

##### `blobToFile(blob, filename)`
Convert blob to File object.

```javascript
const file = AudioUtils.blobToFile(audioBlob, 'session');
```

##### `createAudioBlob(chunks, mimeType)`
Create blob from audio chunks.

```javascript
const blob = AudioUtils.createAudioBlob(chunks, 'audio/webm');
```

##### `estimateDuration(blob)`
Estimate audio duration from size.

```javascript
const seconds = AudioUtils.estimateDuration(audioBlob);
```

##### `formatDuration(seconds)`
Format duration as MM:SS or HH:MM:SS.

```javascript
AudioUtils.formatDuration(3665); // "1:01:05"
```

##### `getRecorderOptions()`
Get optimal MediaRecorder options.

```javascript
const options = AudioUtils.getRecorderOptions();
// { mimeType, audioBitsPerSecond }
```

---

### CacheManager

Generic cache with TTL and invalidation.

**Import:**
```javascript
import { CacheManager } from './scripts/utils/CacheManager.mjs';
```

#### Constructor

```javascript
const cache = new CacheManager({ ttl: 300000, maxSize: 100 }); // 5 min TTL, 100 items
```

#### Methods

##### `get(key)`
Get a cached value (returns `undefined` if expired or missing).

##### `set(key, value, ttl)`
Set a value with optional custom TTL.

##### `has(key)`
Check if key exists and is not expired.

##### `delete(key)`
Remove a specific key.

##### `clear()`
Clear all cached entries.

##### `getStats()`
Get cache statistics: `{ size, hits, misses, hitRate }`.

---

### HtmlUtils

HTML sanitization and formatting.

**Import:**
```javascript
import { HtmlUtils } from './scripts/utils/HtmlUtils.mjs';
```

#### Static Methods

##### `escapeHtml(text)`
Escape HTML special characters to prevent XSS.

```javascript
HtmlUtils.escapeHtml('<script>alert("xss")</script>');
// '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
```

##### `stripHtml(html)`
Remove all HTML tags from a string.

##### `sanitize(html)`
Sanitize HTML, keeping safe tags and removing dangerous ones.

---

### DomUtils

DOM manipulation helpers for ApplicationV2 components.

**Import:**
```javascript
import { DomUtils } from './scripts/utils/DomUtils.mjs';
```

---

### ErrorNotificationHelper

Consistent user-facing error notifications.

**Import:**
```javascript
import { ErrorNotificationHelper } from './scripts/utils/ErrorNotificationHelper.mjs';
```

#### Static Methods

##### `notify(type, error, options)`
Show a user-friendly error notification.

```javascript
ErrorNotificationHelper.notify('transcription', error, {
  context: 'recording session',
  showDetails: true
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `string` | Error category: 'transcription', 'image', 'kanka', 'recording' |
| `error` | `Error` | The error object |
| `options.context` | `string` | Additional context for the error message |
| `options.showDetails` | `boolean` | Show technical details in notification |

---

### SensitiveDataFilter

Filter API keys and tokens from log output.

**Import:**
```javascript
import { SensitiveDataFilter } from './scripts/utils/SensitiveDataFilter.mjs';
```

#### Static Methods

##### `filter(text)`
Replace sensitive data patterns (API keys, tokens) with masked versions.

```javascript
SensitiveDataFilter.filter('Bearer sk-abc123def456...');
// 'Bearer sk-***...***'
```

---

## Type Definitions

### TranscriptionResult

```typescript
interface TranscriptionResult {
  text: string;                    // Full transcription text
  segments: TranscriptionSegment[]; // Speaker-labeled segments
  speakers: SpeakerInfo[];          // Identified speakers
  language?: string;                // Detected/specified language
  duration?: number;                // Audio duration in seconds
  chunked?: boolean;                // Whether transcription was chunked
  chunkCount?: number;              // Number of chunks
  raw?: Object;                     // Raw API response
}

interface TranscriptionSegment {
  speaker: string;         // Speaker name (mapped or original)
  originalSpeaker: string; // Original speaker ID from API
  text: string;            // Segment text
  start: number;           // Start time in seconds
  end: number;             // End time in seconds
}

interface SpeakerInfo {
  id: string;        // Original speaker ID from API
  name: string;      // Mapped name or original ID
  isMapped: boolean; // Whether custom name was applied
}
```

### ImageGenerationResult

```typescript
interface ImageGenerationResult {
  b64_json: string;          // Base64-encoded PNG image data
  entityType: string;        // Type of entity generated
  originalDescription: string; // Original description
  size: string;              // Image size (1024x1024, 1024x1536, 1536x1024)
  quality: string;           // Image quality (low, medium, high)
  generatedAt: number;       // Timestamp when generated
}
// NOTE: gpt-image-1 returns base64 data, NOT URLs like DALL-E 3
```

### ExtractionResult

```typescript
interface ExtractionResult {
  characters: ExtractedCharacter[];
  locations: ExtractedLocation[];
  items: ExtractedItem[];
  summary: string;
  totalCount: number;
}

interface ExtractedCharacter {
  name: string;
  description: string;
  isNPC: boolean;
  role: string;
  entityType: 'character';
}

interface ExtractedLocation {
  name: string;
  description: string;
  type: string;  // 'tavern', 'city', 'dungeon', etc.
  entityType: 'location';
}

interface ExtractedItem {
  name: string;
  description: string;
  type: string;  // 'weapon', 'armor', 'artifact', etc.
  entityType: 'item';
}
```

### SalientMoment

```typescript
interface SalientMoment {
  id: string;          // Unique moment identifier
  title: string;       // Brief, evocative title
  imagePrompt: string; // Detailed prompt for DALL-E
  context: string;     // Context from transcript
  dramaScore: number;  // Drama score 1-10
}
```

### SessionData

```typescript
interface SessionData {
  id: string;                    // Unique session identifier
  title: string;                 // Session title
  date: string;                  // Session date (YYYY-MM-DD)
  startTime: number;             // Start timestamp
  endTime: number | null;        // End timestamp
  speakerMap: Object;            // Speaker ID to name mapping
  language: string | null;       // Transcription language
  audioBlob: Blob | null;        // Recorded audio blob
  transcript: Object | null;     // Transcription result
  entities: Object | null;       // Extracted entities
  moments: Array | null;         // Salient moments
  images: Array;                 // Generated images
  chronicle: Object | null;      // Created Kanka journal
  kankaResults: Object | null;   // Kanka publishing results
  errors: Array;                 // Errors encountered
}
```

### KankaPublishResult

```typescript
interface KankaPublishResult {
  journal: Object | null;    // Created journal entry
  characters: Array;         // Created character entities
  locations: Array;          // Created location entities
  items: Array;              // Created item entities
  images: Array;             // Uploaded images
  errors: Array;             // Publishing errors
}
```

---

## Enumerations

### RecordingState

```javascript
const RecordingState = {
  INACTIVE: 'inactive',
  RECORDING: 'recording',
  PAUSED: 'paused'
};
```

### CaptureSource

```javascript
const CaptureSource = {
  MICROPHONE: 'microphone',
  FOUNDRY_WEBRTC: 'foundry-webrtc',
  SYSTEM_AUDIO: 'system-audio'
};
```

### SessionState

```javascript
const SessionState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
  PROCESSING: 'processing',
  EXTRACTING: 'extracting',
  GENERATING_IMAGES: 'generating_images',
  PUBLISHING: 'publishing',
  COMPLETE: 'complete',
  ERROR: 'error'
};
```

### TranscriptionModel

```javascript
const TranscriptionModel = {
  GPT4O_DIARIZE: 'gpt-4o-transcribe-diarize',
  GPT4O: 'gpt-4o-transcribe',
  WHISPER: 'whisper-1'
};
```

### ImageSize (gpt-image-1)

```javascript
const ImageSize = {
  SQUARE: '1024x1024',      // Best for portraits
  PORTRAIT: '1024x1536',    // Vertical, full-body
  LANDSCAPE: '1536x1024'    // Wide, scenes
};
```

> **Note:** These are the only 3 valid sizes for gpt-image-1. DALL-E 3 sizes (1024x1792, 1792x1024) are NOT valid.

### ImageQuality (gpt-image-1)

```javascript
const ImageQuality = {
  LOW: 'low',          // Fastest
  MEDIUM: 'medium',    // $0.02/image
  HIGH: 'high'         // $0.04/image, best quality
};
```

### KankaEntityType

```javascript
const KankaEntityType = {
  JOURNAL: 'journals',
  CHARACTER: 'characters',
  LOCATION: 'locations',
  ITEM: 'items',
  NOTE: 'notes',
  ORGANISATION: 'organisations',
  FAMILY: 'families',
  EVENT: 'events',
  QUEST: 'quests',
  MAP: 'maps'
};
```

### ChronicleFormat

```javascript
const ChronicleFormat = {
  TRANSCRIPT: 'transcript',  // Raw transcript
  NARRATIVE: 'narrative',    // Narrative prose
  SUMMARY: 'summary',        // Bullet-point
  FULL: 'full'               // Combined
};
```

### FormattingStyle

```javascript
const FormattingStyle = {
  MINIMAL: 'minimal',    // Clean HTML
  RICH: 'rich',          // Rich formatting
  MARKDOWN: 'markdown'   // Kanka markdown
};
```

### LogLevel

```javascript
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  LOG: 2,
  WARN: 3,
  ERROR: 4,
  NONE: 5
};
```

### OpenAIErrorType

```javascript
const OpenAIErrorType = {
  AUTHENTICATION_ERROR: 'authentication_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  INVALID_REQUEST_ERROR: 'invalid_request_error',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error',
  TIMEOUT_ERROR: 'timeout_error'
};
```

### KankaErrorType

```javascript
const KankaErrorType = {
  AUTHENTICATION_ERROR: 'authentication_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  NOT_FOUND_ERROR: 'not_found_error',
  VALIDATION_ERROR: 'validation_error',
  PERMISSION_ERROR: 'permission_error',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error',
  TIMEOUT_ERROR: 'timeout_error'
};
```

---

## Related Documentation

- [Architecture](./ARCHITECTURE.md) - System design and data flow
- [User Guide](./USER_GUIDE.md) - End-user instructions
- [CLAUDE.md](../CLAUDE.md) - AI development context
- [README.md](../README.md) - Project overview
