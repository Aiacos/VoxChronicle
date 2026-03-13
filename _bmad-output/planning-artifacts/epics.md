---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories']
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/prd-validation-report.md
---

# VoxChronicle - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for VoxChronicle, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Audio Capture & Recording (6 FR)**
- FR1: Il DM puo' avviare e arrestare la registrazione audio della sessione
- FR2: Il DM puo' mettere in pausa e riprendere la registrazione durante le pause di gioco
- FR3: Il sistema puo' catturare audio dal microfono del browser o dal WebRTC di Foundry VTT
- FR4: Il sistema puo' registrare audio su Safari tramite fallback codec MP4/AAC
- FR5: Il sistema puo' suddividere automaticamente registrazioni superiori a 25MB in chunk
- FR6: Il DM puo' visualizzare la durata e lo stato della registrazione in corso

**Transcription & Speaker Identification (4 FR)**
- FR7: Il sistema puo' trascrivere l'audio della sessione con identificazione degli speaker
- FR8: Il DM puo' mappare gli ID speaker (SPEAKER_00, SPEAKER_01) ai nomi dei giocatori
- FR9: Il DM puo' visualizzare e revisionare la trascrizione completa con nomi speaker
- FR10: Il sistema puo' trascrivere in almeno 8 lingue (en, it, de, es, fr, ja, pt + configurabili dall'utente)

**Live Session AI Assistance (7 FR)**
- FR11: Il DM puo' avviare una sessione live con assistenza AI in tempo reale
- FR12: Il sistema puo' generare suggerimenti contestuali basati sulla trascrizione corrente e sui journal selezionati
- FR13: Il DM puo' consultare le regole D&D con risposte basate sui compendi di Foundry
- FR14: Il sistema puo' rilevare il tipo di scena corrente (combattimento, sociale, esplorazione, riposo)
- FR15: Il sistema puo' mostrare le risposte AI in streaming token-per-token
- FR16: Il sistema puo' adattare il ciclo di cattura audio in base all'attivita' vocale
- FR17: Il DM puo' selezionare i journal di Foundry da usare come contesto per i suggerimenti

**Chronicle Generation (5 FR)**
- FR18: Il sistema puo' estrarre entita' (NPC, luoghi, oggetti) dalla trascrizione
- FR19: Il DM puo' revisionare, modificare e selezionare le entita' prima della pubblicazione
- FR20: Il sistema puo' generare immagini AI per scene con piu' di 3 turni di dialogo o in corrispondenza di un cambio scena
- FR21: Il sistema puo' formattare la trascrizione come cronaca narrativa
- FR22: Il DM puo' pubblicare cronache, entita' e immagini su Kanka

**AI Provider Management (4 FR)**
- FR23: Il DM puo' configurare API keys per provider AI multipli (OpenAI, Anthropic, Google)
- FR24: Il DM puo' selezionare quale provider AI usare per ogni tipo di operazione
- FR25: Il sistema puo' supportare provider AI intercambiabili senza modifiche al codice di business
- FR26: Il DM puo' visualizzare lo stato di connessione di ogni provider configurato

**RAG & Knowledge Management (4 FR)**
- FR27: Il sistema puo' indicizzare i journal di Foundry per il retrieval contestuale
- FR28: Il sistema puo' indicizzare i compendi di Foundry per le ricerche di regole
- FR29: Il DM puo' scegliere il backend RAG (OpenAI File Search, RAGFlow, o altri)
- FR30: Il sistema puo' arricchire i suggerimenti AI con contesto dalla knowledge base della campagna (journal e compendi)

**Session Analytics (3 FR)**
- FR31: Il DM puo' visualizzare statistiche di partecipazione degli speaker durante la sessione
- FR32: Il DM puo' visualizzare una timeline degli eventi della sessione
- FR33: Il sistema puo' tracciare capitoli e scene durante la sessione live

**UI & Configuration (6 FR)**
- FR34: Il DM puo' accedere a tutte le funzionalita' tramite un pannello floating unificato con tab
- FR35: Il DM puo' configurare tutte le impostazioni del modulo tramite le impostazioni di Foundry
- FR36: Il DM puo' ricevere notifiche in tempo reale sugli eventi della sessione (nuova trascrizione, suggerimento pronto, errore) senza ricaricare il pannello
- FR37: Il DM puo' navigare l'intera UI tramite tastiera
- FR38: Il sistema puo' annunciare aggiornamenti di stato agli screen reader tramite ARIA live regions
- FR39: Il DM puo' gestire vocabolari personalizzati per migliorare l'accuratezza della trascrizione

**Error Handling & Resilience (4 FR)**
- FR40: Il sistema puo' continuare la registrazione audio durante interruzioni di connessione API
- FR41: Il sistema puo' riprendere automaticamente le operazioni AI dopo il ripristino della connessione
- FR42: Il DM puo' visualizzare indicatori di stato con colore e icona distintivi per ogni stato (connesso, disconnesso, errore, in attesa) per connessione AI e registrazione
- FR43: Il sistema puo' degradare gracefully disabilitando le funzionalita' AI mantenendo la registrazione

### NonFunctional Requirements

**Performance (7 NFR)**
- NFR1: I suggerimenti AI live devono apparire entro 3 secondi (p95) dalla fine della trascrizione del chunk corrente
- NFR2: Le risposte rules Q&A devono iniziare lo streaming entro 1 secondo dalla richiesta
- NFR3: Il pannello UI deve aggiornarsi con zero re-render completi del pannello per ciclo live, aggiornando solo gli elementi DOM modificati
- NFR4: La trascrizione di un chunk audio di 30 secondi deve completarsi entro 5 secondi
- NFR5: Le operazioni di cache (hit/miss) devono completarsi entro 10ms
- NFR6: L'indicizzazione RAG di 100 journal deve completarsi entro 60 secondi
- NFR7: Il costo API per sessione di 3 ore deve rimanere sotto i $2 con cache attiva

**Security (6 NFR)**
- NFR8: Le API keys devono essere memorizzate localmente per utente, mai trasmesse a server terzi oltre al provider destinatario
- NFR9: Le API keys non devono mai apparire nei log (SensitiveDataFilter attivo su tutti i canali di logging)
- NFR10: L'audio registrato deve essere processato in-browser e inviato solo all'API di trascrizione configurata, senza storage persistente locale
- NFR11: I dati delle entita' devono essere pubblicati su Kanka solo dopo conferma esplicita dell'utente
- NFR12: Il contenuto AI mostrato nel pannello deve essere sanitizzato per prevenire XSS injection
- NFR13: Le connessioni API devono usare esclusivamente HTTPS

**Scalability (6 NFR)**
- NFR14: Il sistema RAG deve gestire l'indicizzazione di almeno 500 journal di Foundry con latenza di query inferiore a 200ms (p95)
- NFR15: Il Knowledge Graph (Phase 3) deve supportare almeno 100 sessioni accumulate con latenza di ricerca inferiore a 500ms (p95)
- NFR16: Il ciclo live deve mantenere la latenza target (<3s) indipendentemente dalla lunghezza della sessione (fino a 8 ore)
- NFR17: Il sistema di cache deve gestire almeno 1000 entry con overhead di memoria inferiore a 50MB
- NFR18: L'architettura event bus deve supportare almeno 50 subscriber concorrenti con overhead di dispatch inferiore a 1ms per evento
- NFR19: L'AI Provider Interface deve supportare l'aggiunta di nuovi provider senza modifiche al codice chiamante

**Accessibility (6 NFR)**
- NFR20: L'UI deve conformarsi a WCAG 2.1 Level AAA nei limiti della piattaforma Foundry VTT host
- NFR21: Tutti i rapporti di contrasto testo/sfondo devono essere almeno 7:1 (AAA)
- NFR22: Tutti gli elementi interattivi devono essere raggiungibili e operabili tramite sola tastiera
- NFR23: Tutti gli aggiornamenti di stato (suggerimenti, errori, progresso) devono essere annunciati via aria-live regions
- NFR24: L'UI deve rimanere funzionale con zoom browser fino a 200%
- NFR25: Nessun elemento dell'interfaccia deve lampeggiare piu' di 3 volte al secondo

**Integration (7 NFR)**
- NFR26: Il sistema deve supportare le API OpenAI, Anthropic e Google tramite un'interfaccia comune
- NFR27: Le integrazioni API devono gestire rate limiting con retry automatico e backoff progressivo
- NFR28: Le integrazioni Kanka devono rispettare i limiti di 30 req/min (free) e 90 req/min (premium) tramite throttling
- NFR29: Il circuit breaker deve aprirsi dopo 5 fallimenti consecutivi e chiudersi automaticamente dopo 60 secondi di cooldown
- NFR30: L'integrazione con Foundry VTT deve essere compatibile con la versione v13 e mantenere compatibilita' con le API ApplicationV2
- NFR31: Il backend RAG deve essere intercambiabile (OpenAI File Search, RAGFlow, altri) senza impatto sui servizi consumatori
- NFR31b: I servizi interni devono comunicare tramite un sistema di eventi disaccoppiato (pub/sub) per abilitare estensibilita' e reattivita' event-driven

**Reliability (6 NFR)**
- NFR32: La registrazione audio deve continuare senza interruzioni durante failure delle API esterne
- NFR33: Il sistema deve riprendere automaticamente le operazioni AI entro 30 secondi dal ripristino della connessione
- NFR34: Nessuna perdita di dati audio in caso di crash del browser durante la registrazione (chunk salvati progressivamente)
- NFR35: Il processo chronicle deve essere ripetibile — se fallisce a meta', deve poter riprendere dallo step fallito senza riprocessare tutto
- NFR36: Il sistema deve mantenere uno stato consistente dopo qualsiasi errore (nessun stato corrotto che richieda refresh manuale)
- NFR37: Il tempo medio tra failure critiche (MTBF) durante una sessione live deve essere superiore a 4 ore

### Additional Requirements

**Dall'Architecture Document:**

- Event Bus (Observer con canali tipizzati + middleware): canali `ai:`, `scene:`, `session:`, `ui:`, `error:`, `analytics:` — fondamento comunicazione disaccoppiata
- AI Provider Abstraction (Strategy per-capability): interfacce separate `ChatProvider`, `TranscriptionProvider`, `ImageProvider`, `EmbeddingProvider` con `ProviderRegistry`
- State Machine formale (matrice stato×evento): stati `idle → configuring → live → transitioning → chronicle → publishing → complete → error` con guard conditions
- Cache a due livelli (L1 semantica + L2 contenuto): L1 nei servizi con TTL breve (30s-5min), L2 nel provider layer con TTL lungo (1h+)
- ResilienceRegistry centralizzato: circuit breaker + fallback chain dichiarativa + due canali errore (user + technical)
- UI PARTS strategy: `render({ parts: ['partName'] })` per re-render parziali + DOM diretto per micro-update ad alta frequenza
- Streaming architecture: Provider async iterator + StreamController con buffer 16ms (60fps) + eventi su Event Bus
- Design Token System a 3 livelli: Primitivi → Semantici → Componente con integrazione variabili Foundry
- Brownfield codebase v3.4.x: 49 file sorgente, 3888+ test — sostituzione diretta senza adapter, test aggiornati nella stessa PR
- Sequenza implementazione: EventBus → Design Tokens → State Machine → Provider → Cache L2 → Resilience → StreamController → Refactoring servizi → MainPanel PARTS
- 15 file NEW + 13 file REFACTOR identificati nell'architettura
- Layer boundaries: `ui/` mai importa direttamente da `narrator/` o `ai/` — comunica solo via EventBus

**Dalla UX Design Specification:**

- Pannello collassabile adattivo: 48px collassato (solo LED) → 320px espanso — CSS transitions 300ms
- LED system con 6 stati: active (verde), active-pulse (verde pulsante), warning (ambra), error (rosso), idle (grigio), streaming (viola) — con label testuale associata
- First Launch Screen: due card grandi (Live Session / Chronicle Mode) + status API — onboarding implicito senza wizard
- Tab contestuali per fase: Live [Assistente | Regole | Trascrizione] → Chronicle [Cronaca | Entita' | Immagini] + Analytics e Settings come icone secondarie
- Input bar fisso in basso: campo "Chiedi qualcosa..." sempre visibile in Live mode, scompare in Chronicle
- VU meter nell'header: mini barra verticale (3 barre) che pulsa col volume del microfono
- Barra progresso sotto header: 2px che mostra progresso ciclo live (~30s) o chronicle processing
- Streaming text con cursore: font monospace durante streaming → transizione a body quando completo
- Badge notifications: numeri su icone tab per segnalare nuovi suggerimenti/entita' anche in stato collassato
- Transizione automatica Live→Chronicle: evento da SessionOrchestrator, nessuna azione utente
- Empty states con icone SVG: ogni tab vuoto mostra un empty state informativo
- Colori scena: combattimento (rosso), sociale (blu), esplorazione (verde), riposo (ambra)
- prefers-reduced-motion: animazioni pulse e transizioni disabilitate, solo cambi stato istantanei
- State persistence: stato collassato/espanso salvato in localStorage tra sessioni
- Identita' visiva "Modern Tech Assistant": estetica tech moderna, non medievale — mission control per il DM

**Dal PRD Validation Report:**

- Tutti i 43 FR e 38 NFR validati come misurabili e testabili (0 violazioni)
- Catena di tracciabilita' 100% intatta: Executive Summary → Success Criteria → User Journeys → FRs
- Zero implementation leakage nei requisiti
- Rating qualita': 5/5 Excellent — nessun gap critico
- FR16 (ciclo adattivo VAD): soglia di attivazione non specificata in dettaglio — da definire in story
- FR25 (provider intercambiabili): testabile indirettamente
- FR37 (navigazione tastiera): copertura non percentualizzata — da definire acceptance criteria in story

### FR Coverage Map

- FR1: Epic 3 — Avvio/arresto registrazione audio
- FR2: Epic 3 — Pausa/ripresa registrazione
- FR3: Epic 3 — Cattura audio microfono/WebRTC
- FR4: Epic 3 — Fallback codec Safari MP4/AAC
- FR5: Epic 3 — Chunking automatico >25MB
- FR6: Epic 3 — Visualizzazione durata/stato registrazione
- FR7: Epic 3 — Trascrizione con identificazione speaker
- FR8: Epic 3 — Mappatura speaker ID → nomi giocatori
- FR9: Epic 3 — Visualizzazione/revisione trascrizione
- FR10: Epic 3 — Trascrizione multi-lingua (8+)
- FR11: Epic 4 — Avvio sessione live con assistenza AI
- FR12: Epic 4 — Suggerimenti contestuali da trascrizione + journal
- FR13: Epic 4 — Rules Q&A con compendi Foundry
- FR14: Epic 4 — Rilevamento tipo scena
- FR15: Epic 2 — Streaming risposte AI token-per-token
- FR16: Epic 4 — Ciclo adattivo cattura audio (VAD)
- FR17: Epic 4 — Selezione journal per contesto
- FR18: Epic 5 — Estrazione entita' dalla trascrizione
- FR19: Epic 5 — Revisione/modifica entita' pre-pubblicazione
- FR20: Epic 5 — Generazione immagini AI per scene
- FR21: Epic 5 — Formattazione cronaca narrativa
- FR22: Epic 5 — Pubblicazione su Kanka
- FR23: Epic 7 — Configurazione API keys multi-provider
- FR24: Epic 7 — Selezione provider per-task
- FR25: Epic 2 — Provider AI intercambiabili (interfaccia astratta)
- FR26: Epic 7 — Stato connessione per provider
- FR27: Epic 4 — Indicizzazione journal per RAG
- FR28: Epic 4 — Indicizzazione compendi per regole
- FR29: Epic 4 — Scelta backend RAG
- FR30: Epic 4 — Arricchimento suggerimenti con knowledge base
- FR31: Epic 8 — Statistiche partecipazione speaker
- FR32: Epic 8 — Timeline eventi sessione
- FR33: Epic 8 — Tracciamento capitoli/scene
- FR34: Epic 6 — Pannello floating unificato con tab
- FR35: Epic 6 — Configurazione via impostazioni Foundry
- FR36: Epic 6 — Notifiche real-time eventi sessione
- FR37: Epic 8 — Navigazione tastiera completa
- FR38: Epic 8 — ARIA live regions per screen reader
- FR39: Epic 3 — Gestione vocabolari personalizzati
- FR40: Epic 1 — Registrazione continua durante failure API
- FR41: Epic 1 — Ripresa automatica operazioni AI
- FR42: Epic 6 — Indicatori stato con colore/icona
- FR43: Epic 1 — Degradazione graceful

## Epic List

### Epic 1: Foundation Affidabile e Stabilizzazione
Il DM puo' contare su un modulo stabile, senza bug critici, con stati di sessione sempre consistenti e un'infrastruttura resiliente agli errori.
**FRs coperti:** FR40, FR41, FR43

### Epic 2: AI Core Performante
Le risposte AI sono veloci (<3s), economiche (<$2/sessione), e pronte per provider multipli grazie a un'architettura modulare con cache intelligente e streaming.
**FRs coperti:** FR15, FR25

### Epic 3: Registrazione Audio & Trascrizione Intelligente
Il DM puo' registrare sessioni su qualsiasi browser (incluso Safari), ottenere trascrizioni accurate con speaker identificati, e migliorare la precisione con vocabolari custom in 8+ lingue.
**FRs coperti:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR39

### Epic 4: Assistenza AI Live Contestuale
Durante il gioco, il DM riceve suggerimenti basati sul contesto specifico della campagna, puo' consultare regole con citazioni dal compendio, e vede le risposte in streaming — tutto entro 3 secondi.
**FRs coperti:** FR11, FR12, FR13, FR14, FR16, FR17, FR27, FR28, FR29, FR30

### Epic 5: Cronaca Automatica & Pubblicazione Kanka
A fine sessione, il DM ottiene una cronaca narrativa completa con entita' estratte e immagini generate, pubblicabile su Kanka con un click — zero lavoro post-sessione.
**FRs coperti:** FR18, FR19, FR20, FR21, FR22

### Epic 6: Pannello Unificato & Esperienza Adattiva
Il DM interagisce con un pannello floating elegante che si adatta alla fase di gioco (Live→Chronicle), mostra lo stato del sistema con LED intuitivi, e offre un onboarding auto-esplicativo al primo avvio.
**FRs coperti:** FR34, FR35, FR36, FR42

### Epic 7: Multi-Provider AI & Selezione Per-Task
Il DM avanzato puo' configurare provider AI multipli (OpenAI, Claude, Gemini) e assegnare il modello ottimale a ogni operazione — velocita' per i suggerimenti, qualita' per i riassunti.
**FRs coperti:** FR23, FR24, FR26

### Epic 8: Analytics Sessione & Accessibilita' Completa
Il DM puo' analizzare i pattern delle sessioni (partecipazione, timeline, scene) per migliorare il suo gioco, e ogni utente puo' usare VoxChronicle tramite tastiera e screen reader con piena conformita' WCAG AAA.
**FRs coperti:** FR31, FR32, FR33, FR37, FR38

## Epic 1: Foundation Affidabile e Stabilizzazione

Il DM puo' contare su un modulo stabile, senza bug critici, con stati di sessione sempre consistenti e un'infrastruttura resiliente agli errori.

### Story 1.1: Fix Bug Critici e Importanti

As a DM,
I want the module to work without crashes or broken features,
So that I can trust VoxChronicle during game sessions.

**Acceptance Criteria:**

**Given** il modulo e' caricato
**When** i hook Foundry vengono registrati
**Then** tutti gli hook sono attivi e funzionanti (nessun hook morto in main.mjs)
**And** `_hooksRegistered` e' dichiarato e inizializzato correttamente

**Given** una sessione live e' attiva
**When** l'AI genera suggerimenti
**Then** `_aiSuggestionHealth` viene aggiornato ad ogni ciclo

**Given** i 7 bug importanti dall'audit
**When** vengono corretti
**Then** AbortController leak, reinitialize concorrente, reindexQueue overwrite, shutdownController, enrichSession, prepareContext mutation, e Process Session state check sono tutti risolti

**Given** i fix sono applicati
**When** si esegue la test suite
**Then** tutti i 3888+ test passano senza regressioni

### Story 1.2: Event Bus con Canali Tipizzati

As a developer,
I want an internal event bus with typed channels,
So that services communicate without direct coupling and the UI reacts to events without importing service code.

**Acceptance Criteria:**

**Given** l'EventBus e' istanziato
**When** un servizio emette un evento su un canale (es. `ai:suggestionReady`)
**Then** tutti i subscriber di quel canale ricevono l'evento con payload oggetto

**Given** i canali `ai:`, `scene:`, `session:`, `ui:`, `error:`, `analytics:`
**When** un evento viene emesso su un canale
**Then** solo i subscriber di quel canale specifico vengono notificati

**Given** un subscriber si de-registra
**When** un evento viene emesso
**Then** il subscriber rimosso non viene notificato

**Given** 50 subscriber concorrenti
**When** un evento viene emesso
**Then** il dispatch completa in meno di 1ms (NFR18)

**Given** il modulo e' in dev mode
**When** un evento viene emesso
**Then** il middleware di logging registra canale, evento e payload

**Given** l'EventBus
**When** si scrivono test
**Then** il file `tests/core/EventBus.test.js` copre emit, subscribe, unsubscribe, canali, middleware, e performance

### Story 1.3: State Machine Sessione Formale

As a DM,
I want the session to always be in a valid state,
So that I never encounter corrupted states requiring a manual page refresh.

**Acceptance Criteria:**

**Given** la matrice di transizione definita (idle, configuring, live, transitioning, chronicle, publishing, complete, error)
**When** viene richiesta una transizione valida
**Then** lo stato cambia e un evento `session:stateChanged` viene emesso su EventBus con `{ from, to, event, timestamp }`

**Given** lo stato corrente
**When** viene richiesta una transizione non definita nella matrice
**Then** la transizione viene rifiutata e lo stato resta invariato

**Given** una guard condition (es. non puo' passare a `chronicle` senza transcript)
**When** la guard fallisce
**Then** la transizione non avviene

**Given** lo stato corrente
**When** si verifica un errore critico
**Then** la macchina transita a stato `error` e l'evento viene emesso

**Given** lo stato e' serializzato in localStorage
**When** il browser viene ricaricato
**Then** lo stato puo' essere ripristinato (NFR36)

**Given** la State Machine
**When** si scrivono test
**Then** `tests/core/SessionStateMachine.test.js` copre tutte le transizioni, guard, serializzazione e casi invalidi

### Story 1.4: ResilienceRegistry Centralizzato

As a DM,
I want the system to handle API failures gracefully with automatic recovery,
So that temporary connection issues don't ruin my game session.

**Acceptance Criteria:**

**Given** un servizio registrato nel ResilienceRegistry
**When** una chiamata API fallisce
**Then** il circuit breaker conta il fallimento

**Given** 5 fallimenti consecutivi per un servizio
**When** il 6° tentativo viene fatto
**Then** il circuit breaker si apre e usa la fallback chain (NFR29)

**Given** il circuit breaker e' aperto
**When** passano 60 secondi
**Then** il circuit breaker si chiude automaticamente e permette nuovi tentativi

**Given** una fallback chain configurata (provider secondario → cache L2 → messaggio offline)
**When** il provider primario fallisce
**Then** la chain viene eseguita in ordine

**Given** un errore si verifica
**When** viene emesso
**Then** due eventi partono: `error:user` (toast UI) e `error:technical` (log debug)

**Given** la registrazione audio e' attiva
**When** le API AI falliscono
**Then** la registrazione continua senza interruzioni (FR40, NFR32)

**Given** la connessione viene ripristinata
**When** le API tornano disponibili
**Then** le operazioni AI riprendono entro 30 secondi (FR41, NFR33)

### Story 1.5: Design Token System CSS

As a DM,
I want VoxChronicle to look visually consistent and integrated with Foundry VTT,
So that the module feels like a natural part of my game environment.

**Acceptance Criteria:**

**Given** il file `styles/tokens/primitives.css`
**When** caricato
**Then** definisce la palette colori base (`--vox-green-400`, `--vox-purple-500`, etc.)

**Given** il file `styles/tokens/semantic.css`
**When** caricato
**Then** mappa primitivi a ruoli semantici (`--vox-color-success`, `--vox-led-active`, `--vox-color-ai-bg`, etc.) con fallback a variabili Foundry

**Given** il file `styles/tokens/components.css`
**When** caricato
**Then** definisce token per-componente (`--vox-led-active`, `--vox-tab-height`, etc.) derivati da semantici

**Given** i design tokens
**When** il tema Foundry cambia (dark/light)
**Then** i colori VoxChronicle si adattano automaticamente tramite le variabili Foundry ereditate

**Given** tutte le classi CSS del modulo
**When** si esegue un audit
**Then** zero classi non-namespaced con `.vox-chronicle` prefix

## Epic 2: AI Core Performante

Le risposte AI sono veloci (<3s), economiche (<$2/sessione), e pronte per provider multipli grazie a un'architettura modulare con cache intelligente e streaming.

### Story 2.1: AI Provider Interface e ProviderRegistry

As a developer,
I want abstract provider interfaces (ChatProvider, TranscriptionProvider, ImageProvider, EmbeddingProvider) with a central registry,
So that any AI provider can be added by implementing a single interface without modifying calling code.

**Acceptance Criteria:**

**Given** le interfacce `ChatProvider`, `TranscriptionProvider`, `ImageProvider`, `EmbeddingProvider`
**When** un provider le implementa
**Then** espone i metodi obbligatori (`chat()`, `chatStream()`, `transcribe()`, `generateImage()`, `embed()`) con options standardizzate `{ model, temperature, maxTokens, abortSignal }`

**Given** un provider
**When** si interroga `static get capabilities()`
**Then** ritorna l'array delle capability supportate (es. `['chat', 'chatStream', 'transcribe']`)

**Given** `ProviderRegistry.register('openai', OpenAIProvider, { default: true })`
**When** si chiama `ProviderRegistry.getProvider('chat')`
**Then** ritorna il provider default per la capability `chat`

**Given** nessun provider registrato per una capability
**When** si richiede
**Then** viene lanciato un errore chiaro con messaggio i18n (NFR19)

### Story 2.2: Implementazione OpenAI Provider

As a DM,
I want OpenAI to work as the first AI provider through the new interface,
So that all existing functionality continues to work with the new architecture.

**Acceptance Criteria:**

**Given** `OpenAIChatProvider`
**When** viene chiamato `chat(messages, options)`
**Then** ritorna `{ content, usage }` usando l'API OpenAI

**Given** `OpenAIChatProvider`
**When** viene chiamato `chatStream(messages, options)`
**Then** ritorna un async iterator di `{ token, done }` via SSE

**Given** `OpenAITranscriptionProvider`
**When** viene chiamato `transcribe(audioBlob, options)`
**Then** ritorna `{ text, segments }` usando FormData (non JSON)

**Given** `OpenAIImageProvider`
**When** viene chiamato `generateImage(prompt, options)`
**Then** ritorna `{ data, format }` con base64 da gpt-image-1

**Given** `OpenAIEmbeddingProvider`
**When** viene chiamato `embed(text, options)`
**Then** ritorna `{ embedding, dimensions }`

**Given** i provider OpenAI registrati
**When** i servizi esistenti vengono refactored
**Then** usano ProviderRegistry invece di OpenAIClient diretto

### Story 2.3: Parallelizzazione Code AI e Cache a Due Livelli

As a DM,
I want AI requests to be fast and not block each other, with intelligent caching to reduce costs,
So that suggestions arrive in <3 seconds and each session costs less than $2.

**Acceptance Criteria:**

**Given** la coda sequenziale globale in OpenAIClient
**When** viene sostituita con code per-tipo
**Then** richieste di tipo diverso (chat, transcription, image) procedono in parallelo

**Given** Cache L1 semantica nei servizi
**When** un suggerimento viene richiesto per lo stesso contesto (scena+capitolo) entro il TTL (30s-2min)
**Then** il risultato cached viene restituito senza chiamata API

**Given** Cache L2 contenuto nel provider layer
**When** una query RAG identica viene fatta entro il TTL (1h+)
**Then** il risultato cached viene restituito

**Given** un cambio scena
**When** l'evento `scene:changed` viene emesso
**Then** la cache L1 dei suggerimenti viene invalidata (`narrator:suggestion:*`)

**Given** le operazioni di cache
**When** eseguite (hit o miss)
**Then** completano in meno di 10ms (NFR5)

**Given** una sessione di 3 ore con cache attiva
**When** si contano le chiamate API
**Then** sono ridotte di almeno il 50% rispetto a senza cache (NFR7)

### Story 2.4: StreamController UI

As a DM,
I want to see AI responses appearing token by token in real time,
So that I can start reading immediately without waiting for the complete response.

**Acceptance Criteria:**

**Given** un `ChatProvider.chatStream()` attivo
**When** i token arrivano
**Then** StreamController li bufferizza e li fluscia al DOM ogni 16ms (60fps)

**Given** lo streaming e' in corso
**When** l'utente vede il pannello
**Then** il testo appare progressivamente con cursore lampeggiante (CSS, non flash reale — NFR25)

**Given** lo streaming completa
**When** l'ultimo token arriva
**Then** il cursore scompare e il font passa da monospace a body

**Given** eventi streaming
**When** partono/finiscono
**Then** vengono emessi `ai:streamStart`, `ai:token`, `ai:streamEnd`, `ai:streamError` su EventBus

**Given** l'utente vuole interrompere
**When** preme un pulsante cancel
**Then** `AbortController` interrompe il provider e StreamController pulisce il DOM

**Given** le risposte Rules Q&A
**When** streaming inizia
**Then** il primo token appare entro 1 secondo dalla richiesta (NFR2)

## Epic 3: Registrazione Audio & Trascrizione Intelligente

Il DM puo' registrare sessioni su qualsiasi browser (incluso Safari), ottenere trascrizioni accurate con speaker identificati, e migliorare la precisione con vocabolari custom in 8+ lingue.

### Story 3.1: Registrazione Audio Completa con Safari Fallback

As a DM,
I want to record game sessions on any browser including Safari,
So that audio capture works reliably regardless of my browser choice.

**Acceptance Criteria:**

**Given** il DM clicca "Start Recording"
**When** il microfono e' disponibile
**Then** la registrazione inizia e l'indicatore mostra durata e stato

**Given** una registrazione attiva
**When** il DM clicca "Pause"
**Then** la registrazione si sospende mantenendo i dati, e "Resume" la riprende

**Given** una registrazione attiva
**When** il DM clicca "Stop"
**Then** la registrazione si ferma e il blob audio e' disponibile

**Given** il browser e' Safari
**When** WebM/Opus non e' supportato
**Then** AudioRecorder usa fallback MP4/AAC automaticamente (FR4)

**Given** il DM sceglie cattura WebRTC
**When** Foundry VTT ha peer audio attivi
**Then** il sistema cattura l'audio dai peer (FR3)

**Given** una registrazione superiore a 25MB
**When** il processing inizia
**Then** AudioChunker divide automaticamente in chunk validi (FR5)

**Given** un crash del browser durante la registrazione
**When** l'utente riapre Foundry
**Then** i chunk salvati progressivamente sono recuperabili (NFR34)

### Story 3.2: Trascrizione con Diarizzazione e Multi-Lingua

As a DM,
I want accurate transcriptions with speaker identification in my language,
So that I can review who said what during the session.

**Acceptance Criteria:**

**Given** un blob audio
**When** viene inviato al TranscriptionProvider
**Then** ritorna testo con segmenti speaker-labeled (SPEAKER_00, SPEAKER_01, etc.) (FR7)

**Given** un chunk audio di 30 secondi
**When** viene trascritto
**Then** la trascrizione completa entro 5 secondi (NFR4)

**Given** la lingua configurata (es. italiano)
**When** la trascrizione viene eseguita
**Then** il modello usa la lingua corretta (FR10, supporto 8+ lingue: en, it, de, es, fr, ja, pt + configurabili)

**Given** un vocabolario personalizzato configurato
**When** la trascrizione viene eseguita
**Then** i termini custom (nomi NPC, luoghi) vengono usati come context prompt per migliorare accuratezza (FR39)

### Story 3.3: Mappatura Speaker e Revisione Trascrizione

As a DM,
I want to map speaker IDs to player names and review the complete transcript,
So that the transcript is readable and ready for chronicle generation.

**Acceptance Criteria:**

**Given** speaker ID (SPEAKER_00, SPEAKER_01) nella trascrizione
**When** il DM apre Speaker Labeling
**Then** puo' assegnare nomi ai speaker con rename inline (FR8)

**Given** la mappatura speaker salvata
**When** una nuova sessione viene trascritta
**Then** la mappatura precedente e' pre-applicata (persistente tra sessioni)

**Given** la trascrizione completa
**When** il DM apre la vista trascrizione
**Then** vede il testo completo con nomi speaker, timestamp, e possibilita' di revisione (FR9)

## Epic 4: Assistenza AI Live Contestuale

Durante il gioco, il DM riceve suggerimenti basati sul contesto specifico della campagna, puo' consultare regole con citazioni dal compendio, e vede le risposte in streaming — tutto entro 3 secondi.

### Story 4.1: Avvio Sessione Live e Ciclo AI

As a DM,
I want to start a live session that automatically captures, transcribes, and analyzes the game in real time,
So that I receive contextual AI assistance without manual intervention.

**Acceptance Criteria:**

**Given** il DM clicca "Start Live Session"
**When** la configurazione e' valida (API key, journal)
**Then** la sessione live inizia: registrazione audio, trascrizione ciclica, e analisi AI si attivano (FR11)

**Given** la sessione live e' attiva
**When** un chunk audio viene trascritto
**Then** il suggerimento contestuale appare entro 3 secondi (p95) dalla fine della trascrizione (NFR1)

**Given** il ciclo live
**When** il livello di attivita' vocale cambia
**Then** la durata dei chunk si adatta: ~15s durante conversazioni intense, ~45-60s durante pause (FR16)

**Given** la sessione live e' attiva
**When** la State Machine e' in stato `live`
**Then** il ciclo continua fino a "Stop Session" o errore critico

**Given** la latenza target <3s
**When** la sessione dura fino a 8 ore
**Then** la latenza resta stabile (NFR16)

### Story 4.2: Suggerimenti Contestuali da Journal e RAG

As a DM,
I want suggestions based on my specific campaign journals, not generic D&D knowledge,
So that the AI references my NPCs, locations, and plot points accurately.

**Acceptance Criteria:**

**Given** il DM ha selezionato journal specifici
**When** il sistema genera suggerimenti
**Then** il contesto RAG proviene dai journal selezionati (FR12, FR17)

**Given** i journal di Foundry
**When** vengono indicizzati per il RAG
**Then** il testo viene estratto dal formato HTML/Foundry e indicizzato (FR27)

**Given** 100 journal
**When** vengono indicizzati
**Then** l'indicizzazione completa entro 60 secondi (NFR6)

**Given** 500 journal indicizzati
**When** una query RAG viene eseguita
**Then** la latenza e' inferiore a 200ms (p95) (NFR14)

**Given** il contesto RAG
**When** il suggerimento viene generato
**Then** il contenuto menziona NPC, luoghi e eventi specifici della campagna, non consigli generici (FR30)

**Given** il DM puo' scegliere backend RAG
**When** configura le settings
**Then** puo' selezionare OpenAI File Search, RAGFlow, o altri (FR29)

### Story 4.3: Rules Q&A con Compendi Foundry

As a DM,
I want to ask rules questions and get instant answers with compendium citations,
So that I don't need to pause the game to look up rules manually.

**Acceptance Criteria:**

**Given** il DM digita una domanda di regole
**When** il sistema la riconosce come rules query
**Then** cerca nei compendi di Foundry indicizzati e risponde con citazione (FR13)

**Given** i compendi di Foundry
**When** vengono indicizzati
**Then** il testo delle regole viene estratto e reso disponibile per la ricerca (FR28)

**Given** una domanda di regole
**When** la risposta in streaming inizia
**Then** il primo token appare entro 1 secondo (NFR2)

**Given** la risposta
**When** viene mostrata
**Then** include il riferimento al compendio source (nome compendio, pagina/entry)

### Story 4.4: Rilevamento Tipo Scena

As a DM,
I want the system to detect the current scene type automatically,
So that suggestions are contextually appropriate to what's happening in the game.

**Acceptance Criteria:**

**Given** la trascrizione corrente
**When** viene analizzata
**Then** il tipo di scena viene rilevato: combattimento, sociale, esplorazione, o riposo (FR14)

**Given** un cambio scena rilevato
**When** il tipo cambia
**Then** un evento `scene:changed` viene emesso su EventBus con `{ sceneType, confidence, timestamp }`

**Given** il tipo di scena
**When** il suggerimento viene generato
**Then** il contenuto e' adattato al contesto (es. tattiche in combattimento, NPC in sociale)

**Given** il badge scena nel pannello
**When** la scena cambia
**Then** il badge si aggiorna con colore e label appropriati (combattimento=rosso, sociale=blu, esplorazione=verde, riposo=ambra)

## Epic 5: Cronaca Automatica & Pubblicazione Kanka

A fine sessione, il DM ottiene una cronaca narrativa completa con entita' estratte e immagini generate, pubblicabile su Kanka con un click — zero lavoro post-sessione.

### Story 5.1: Estrazione Entita' e Revisione

As a DM,
I want entities (NPCs, locations, items) automatically extracted from the transcript,
So that I don't need to manually catalog what happened in the session.

**Acceptance Criteria:**

**Given** una trascrizione completa
**When** il processing chronicle inizia
**Then** il sistema estrae NPC, luoghi e oggetti menzionati (FR18)

**Given** le entita' estratte
**When** il DM apre Entity Preview
**Then** puo' revisionare, modificare nomi/descrizioni, e deselezionare entita' da non pubblicare (FR19)

**Given** entita' gia' esistenti su Kanka
**When** vengono estratte
**Then** il sistema rileva duplicati e propone merge invece di creazione

### Story 5.2: Generazione Immagini e Cronaca Narrativa

As a DM,
I want AI-generated images for key scenes and a narrative chronicle,
So that the published session is visually rich and readable by players.

**Acceptance Criteria:**

**Given** la trascrizione analizzata
**When** una scena ha piu' di 3 turni di dialogo o coincide con un cambio scena
**Then** il sistema genera un'immagine AI con gpt-image-1 (FR20)

**Given** la trascrizione completa
**When** il sistema la formatta
**Then** produce una cronaca narrativa leggibile e di qualita' pubblicabile (FR21)

**Given** il contenuto AI generato (cronaca, descrizioni)
**When** viene mostrato nel pannello
**Then** e' sanitizzato per prevenire XSS (NFR12)

### Story 5.3: Pubblicazione su Kanka

As a DM,
I want to publish the chronicle, entities, and images to Kanka with one click,
So that players find everything ready without any manual work.

**Acceptance Criteria:**

**Given** cronaca, entita' e immagini pronti
**When** il DM clicca "Pubblica su Kanka"
**Then** tutto viene pubblicato sulla campagna Kanka configurata (FR22)

**Given** la pubblicazione
**When** i dati vengono inviati
**Then** il rate limiting Kanka e' rispettato (30/min free, 90/min premium) (NFR28)

**Given** i dati delle entita'
**When** la pubblicazione parte
**Then** avviene solo dopo conferma esplicita dell'utente (NFR11)

**Given** la pubblicazione fallisce a meta'
**When** il DM riprova
**Then** il processo riprende dallo step fallito senza riprocessare tutto (NFR35)

## Epic 6: Pannello Unificato & Esperienza Adattiva

Il DM interagisce con un pannello floating elegante che si adatta alla fase di gioco (Live→Chronicle), mostra lo stato del sistema con LED intuitivi, e offre un onboarding auto-esplicativo al primo avvio.

### Story 6.1: Pannello Collassabile con LED System

As a DM,
I want a compact collapsible panel with LED status indicators,
So that I can monitor the system at a glance without losing screen space.

**Acceptance Criteria:**

**Given** il pannello VoxChronicle
**When** collassato
**Then** occupa 48px mostrando solo LED di stato (registrazione, AI, streaming) e puo' essere espanso a 320px con click

**Given** i LED di stato
**When** lo stato cambia
**Then** il colore si aggiorna: verde (attivo), verde pulsante (registrazione), viola (streaming), ambra (warning), rosso (errore), grigio (idle) — ogni LED ha label testuale e `aria-label`

**Given** il VU meter nell'header
**When** il microfono cattura audio
**Then** le 3 barre pulsano col volume — feedback visivo immediato

**Given** la barra progresso sotto l'header
**When** il ciclo live e' attivo
**Then** si riempie da sinistra a destra ogni ~30s

**Given** lo stato collassato/espanso
**When** il DM chiude e riapre Foundry
**Then** lo stato e' persistito in localStorage

### Story 6.2: First Launch Screen e Tab Contestuali

As a DM,
I want an intuitive first-time experience and context-aware tabs,
So that I understand how to use VoxChronicle immediately without any tutorial.

**Acceptance Criteria:**

**Given** il primo avvio (o nessuna sessione attiva)
**When** il DM apre il pannello
**Then** vede la First Launch Screen con due card grandi (Live Session / Chronicle Mode) e status API

**Given** una sessione live attiva
**When** il pannello e' aperto
**Then** i tab mostrano [Assistente | Regole | Trascrizione] + Analytics e Settings come icone secondarie

**Given** il DM clicca "Stop Session"
**When** la sessione live termina
**Then** il pannello transisce automaticamente ai tab Chronicle [Cronaca | Entita' | Immagini] senza azione manuale

**Given** nuovi suggerimenti o entita' estratte
**When** il pannello e' collassato
**Then** badge numerici appaiono sulle icone tab corrispondenti

**Given** il pannello
**When** aggiorna il contenuto durante il ciclo live
**Then** usa `render({ parts: ['partName'] })` o DOM diretto — zero re-render completi (NFR3)

### Story 6.3: Input Bar e Notifiche Real-Time

As a DM,
I want a persistent query input and real-time notifications,
So that I can ask questions anytime and stay informed without reloading.

**Acceptance Criteria:**

**Given** la sessione live e' attiva
**When** il pannello e' espanso
**Then** un input bar "Chiedi qualcosa..." e' sempre visibile in basso

**Given** il DM digita una domanda
**When** preme invio
**Then** il sistema distingue tra domanda di contesto e domanda di regole, e risponde in streaming

**Given** la sessione e' in Chronicle mode
**When** il pannello e' aperto
**Then** l'input bar non e' visibile

**Given** un evento della sessione (nuova trascrizione, suggerimento pronto, errore)
**When** viene emesso su EventBus
**Then** il DM riceve una notifica real-time nel pannello senza ricaricarlo (FR36)

**Given** tutte le impostazioni del modulo
**When** il DM apre Settings
**Then** puo' configurarle tramite le impostazioni standard di Foundry (FR35)

## Epic 7: Multi-Provider AI & Selezione Per-Task

Il DM avanzato puo' configurare provider AI multipli (OpenAI, Claude, Gemini) e assegnare il modello ottimale a ogni operazione — velocita' per i suggerimenti, qualita' per i riassunti.

### Story 7.1: Provider Anthropic e Google

As a DM,
I want to use Claude and Gemini as AI providers,
So that I can choose the best model for each task.

**Acceptance Criteria:**

**Given** il DM inserisce una API key Anthropic
**When** viene validata
**Then** i modelli Claude (Sonnet, Opus) diventano disponibili nel ProviderRegistry

**Given** il DM inserisce una API key Google
**When** viene validata
**Then** i modelli Gemini diventano disponibili nel ProviderRegistry

**Given** un provider Anthropic/Google
**When** implementa ChatProvider
**Then** espone `chat()` e `chatStream()` con la stessa interfaccia di OpenAI

**Given** le integrazioni API
**When** chiamate falliscono
**Then** gestiscono rate limiting con retry automatico e backoff progressivo (NFR27)

### Story 7.2: Selezione Modello Per-Task e Status Provider

As a DM,
I want to assign different AI models to different tasks and see connection status,
So that I optimize speed, quality, and cost for each operation.

**Acceptance Criteria:**

**Given** le settings VoxChronicle
**When** il DM apre la sezione AI Providers
**Then** vede una tabella task-provider: ogni riga e' un task (Suggerimenti, Riassunto, Regole, Estrazione, Immagini), ogni colonna ha un dropdown modello (FR24)

**Given** un'API key non inserita per un provider
**When** il DM vede i dropdown
**Then** i modelli di quel provider sono grayed-out con hint "Inserisci API key per attivare" (FR23)

**Given** provider configurati
**When** il DM apre il pannello
**Then** vede lo stato di connessione di ogni provider (connesso/disconnesso/errore) con indicatore visivo (FR26)

**Given** la configurazione salvata
**When** un task viene eseguito
**Then** usa il provider e modello assegnato per quel task specifico

## Epic 8: Analytics Sessione & Accessibilita' Completa

Il DM puo' analizzare i pattern delle sessioni (partecipazione, timeline, scene) per migliorare il suo gioco, e ogni utente puo' usare VoxChronicle tramite tastiera e screen reader con piena conformita' WCAG AAA.

### Story 8.1: Dashboard Analytics Sessione

As a DM,
I want to see session analytics with speaker participation and event timeline,
So that I can improve my game mastering and balance player participation.

**Acceptance Criteria:**

**Given** una sessione completata
**When** il DM apre la tab Analytics
**Then** vede statistiche di partecipazione per speaker (tempo parlato, numero interventi) (FR31)

**Given** i dati della sessione
**When** la tab Analytics mostra la timeline
**Then** visualizza gli eventi chiave della sessione in ordine cronologico (FR32)

**Given** la sessione live
**When** il ChapterTracker rileva cambi capitolo/scena
**Then** i capitoli e scene sono tracciati e visibili nella timeline (FR33)

**Given** gli eventi analytics
**When** vengono raccolti
**Then** sono emessi sul canale `analytics:` dell'EventBus

### Story 8.2: Navigazione Tastiera e Accessibilita' WCAG AAA

As a user with accessibility needs,
I want to fully operate VoxChronicle via keyboard and screen reader,
So that the module is usable regardless of my abilities.

**Acceptance Criteria:**

**Given** tutti i controlli, tab, pulsanti e dialog
**When** l'utente naviga via tastiera
**Then** sono raggiungibili e operabili con ordine logico (FR37, NFR22)

**Given** aggiornamenti di stato (suggerimenti, errori, progresso)
**When** cambiano
**Then** vengono annunciati via aria-live regions (FR38, NFR23)

**Given** tutti i rapporti di contrasto testo/sfondo
**When** vengono misurati
**Then** sono almeno 7:1 (AAA) (NFR21)

**Given** elementi interattivi
**When** ricevono focus
**Then** mostrano un focus ring chiaro `2px solid var(--vox-color-accent)` con `outline-offset: 2px`

**Given** l'UI
**When** il browser zooma al 200%
**Then** l'interfaccia resta funzionale e leggibile (NFR24)

**Given** indicatori LED e animazioni
**When** `prefers-reduced-motion: reduce` e' attivo
**Then** le animazioni pulse si disabilitano, solo cambi stato istantanei (NFR25)

**Given** l'UI nel contesto Foundry VTT
**When** si valuta conformita'
**Then** rispetta WCAG 2.1 Level AAA nei limiti della piattaforma host (NFR20)
