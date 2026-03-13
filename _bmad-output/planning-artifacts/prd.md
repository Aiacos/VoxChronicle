---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-01b-continue', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete', 'step-e-01-discovery', 'step-e-02-review', 'step-e-03-edit']
lastEdited: '2026-03-07'
editHistory:
  - date: '2026-03-07'
    changes: 'Validation-driven improvements: added Journey 5 (analytics/vocabulary/multilang), rewrote 6 FRs (implementation leakage + measurability), added metrics to 6 vague NFRs, removed implementation leakage from 3 NFRs, moved event bus from FR to NFR, cleaned info density violations'
inputDocuments:
  - docs/ARCHITECTURE.md
  - docs/API_REFERENCE.md
  - docs/USER_GUIDE.md
  - CLAUDE.md
  - memory/audit-2026-03-07.md
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 5
workflowType: 'prd'
projectType: 'brownfield'
classification:
  projectType: web_app
  domain: general
  complexity: medium
  projectContext: brownfield
vision:
  statement: "VoxChronicle deve essere il compagno AI affidabile e veloce del DM — presente durante il gioco con suggerimenti precisi e tempestivi, e silenziosamente efficiente dopo la sessione nel documentare tutto su Kanka."
  differentiator: "Integrazione completa del ciclo di gioco — dal supporto live alla cronaca automatica — con la libertà di scegliere i modelli AI più adatti ad ogni compito."
  coreInsight: "L'affidabilità batte la potenza. Un consiglio semplice che arriva al momento giusto vale più di un'analisi brillante che arriva 30 secondi dopo."
  pillars:
    - "DM supportato e sicuro durante il gioco con accesso affidabile al contesto dell'avventura"
    - "Cronaca automatica post-sessione su Kanka con immagini, senza lavoro extra"
    - "Modularità AI per scegliere il modello migliore per ogni task"
    - "UI chiara e non confusionaria, che non aggiunge carico cognitivo al DM"
---

# Product Requirements Document - VoxChronicle

**Author:** Aiacos
**Date:** 2026-03-07

## Executive Summary

VoxChronicle e' un modulo AI per Foundry VTT v13 che serve come compagno di sessione per il Dungeon Master. Opera in due modalita': **Live Mode** per assistenza in tempo reale durante il gioco (suggerimenti narrativi, regole Q&A, rilevamento scene, analytics) e **Chronicle Mode** per la documentazione automatica post-sessione (trascrizione, estrazione entita', generazione immagini, pubblicazione su Kanka).

Il sistema e' attualmente alla versione 3.4.x con 49 file sorgente e 3888+ test. Un audit completo ha identificato criticita' in tre aree: **performance AI/RAG** (coda sequenziale globale, cache inutilizzate, query duplicate che rendono i consigli lenti e poco tempestivi), **stabilita' del codice** (3 bug critici tra cui hook morti e proprieta' mai dichiarate), e **coerenza UI** (template disconnessi, CSS non namespaced, tab analytics non funzionante).

Questa evoluzione mira a trasformare VoxChronicle da strumento promettente ma inaffidabile a **compagno AI di cui il DM puo' fidarsi**. L'affidabilita' batte la potenza: un consiglio semplice che arriva al momento giusto vale piu' di un'analisi brillante che arriva 30 secondi dopo.

### Cosa Rende Speciale Questo Prodotto

**Integrazione completa del ciclo di gioco.** Nessun altro modulo Foundry VTT copre l'intero arco — dal supporto live durante la sessione alla cronaca automatica post-sessione su Kanka con immagini generate dall'AI. VoxChronicle elimina il lavoro manuale di documentazione senza sacrificare la qualita' narrativa.

**Modularita' AI per scelta del modello.** L'architettura provider permettera' al DM di scegliere il modello AI ottimale per ogni task: un modello veloce per i suggerimenti real-time, uno piu' potente per i riassunti narrativi, uno locale per la privacy. Non piu' vendor-lock su un singolo fornitore.

**Supporto affidabile al contesto dell'avventura.** Il DM che non ricorda un dettaglio dell'avventura ha un supporto solido su cui fare affidamento, alimentato dal RAG sui journal di Foundry e dai compendi delle regole.

## Classificazione Progetto

| Attributo | Valore |
|-----------|--------|
| **Tipo** | Web App (modulo browser-side per Foundry VTT, ApplicationV2) |
| **Dominio** | General (TTRPG tooling con integrazione AI multi-provider) |
| **Complessita'** | Media (multi-API, dual-mode workflow, nessun requisito normativo) |
| **Contesto** | Brownfield — sistema esistente v3.4.x, 49 sorgenti, 3888+ test |
| **Focus evoluzione** | Stabilita', Performance AI/RAG, Modularita' AI, UI Unificata |

## Success Criteria

### User Success

- **Suggerimenti sotto i 3 secondi:** Il tempo tra la fine di un ciclo di trascrizione e la visualizzazione del suggerimento nel pannello deve essere inferiore a 3 secondi nel 95% dei casi
- **Suggerimenti contestuali, non generici:** I consigli AI devono riferirsi a NPC, luoghi e trama specifici della campagna in corso, attingendo dai journal di Foundry e non da conoscenza generica del modello
- **Zero intervento post-sessione:** La cronaca pubblicata su Kanka deve essere leggibile e completa (riassunto + entita' + immagini) senza editing manuale
- **UI auto-esplicativa:** Un DM che usa VoxChronicle per la prima volta deve capire come avviare una sessione live o chronicle entro 30 secondi dall'apertura del pannello

### Business Success

- **Breve termine (3 mesi):** Modulo stabile con zero bug critici, pronto per distribuzione open-source su FoundryVTT
- **Medio termine (6 mesi):** Modularita' AI completa (4 provider: OpenAI GPT-5.4, Claude Sonnet/Opus, Gemini) — valore differenziante per la conversione a pacchetto premium
- **Lungo termine (12 mesi):** Pacchetto a pagamento nello store FoundryVTT con base utenti attiva e recensioni positive

### Technical Success

- **Zero bug critici:** I 3 bug critici dall'audit (hook morti in `main.mjs`, `_hooksRegistered` mai dichiarato, `_aiSuggestionHealth` non aggiornato) devono essere eliminati
- **Parallelizzazione coda AI:** La coda sequenziale globale in `OpenAIClient.mjs` deve essere sostituita con code per-tipo che permettano richieste concorrenti indipendenti
- **Cache attive nei percorsi critici:** `CacheManager` deve essere integrato in RAG query, regole, e suggerimenti — riducendo chiamate API duplicate di almeno il 50%
- **Provider AI modulare:** Architettura provider che permetta di aggiungere un nuovo modello AI implementando una singola interfaccia, senza modificare il codice chiamante
- **Test coverage mantenuta:** La copertura test (3888+ test) deve rimanere stabile o crescere con ogni cambiamento

### Measurable Outcomes

| Metrica | Stato Attuale | Obiettivo |
|---------|--------------|-----------|
| Latenza suggerimenti live | >10s (stimato) | <3s (p95) |
| Bug critici aperti | 3 | 0 |
| Provider AI supportati | 1 (OpenAI) | 4 (OpenAI, Claude, Gemini, +1) |
| Chiamate API duplicate per ciclo | ~3 per suggerimento | 1 (con cache) |
| CSS classi non-namespaced | ~80+ | 0 |
| Template disconnessi/orfani | 2 (recorder.hbs, analytics) | 0 |

## User Journeys

### Journey 1: Marco, il DM — Sessione Live (Happy Path)

Marco e' un DM esperto che gestisce una campagna settimanale di D&D 5e con 4 giocatori. Ha preparato l'avventura sui journal di Foundry ma non ricorda tutti i dettagli delle sessioni precedenti.

**Opening Scene:** Venerdi' sera, 20:30. Marco apre Foundry VTT, carica il mondo della campagna. Clicca l'icona VoxChronicle nella sidebar e seleziona i journal dell'avventura corrente. Preme "Start Live Session". Il microfono si attiva, la trascrizione parte.

**Rising Action:** I giocatori decidono di tornare al villaggio di Thornfield — un luogo descritto 3 sessioni fa. Marco non ricorda i dettagli. In meno di 3 secondi, VoxChronicle mostra un suggerimento contestuale: *"Thornfield: il sindaco Aldric ha promesso una ricompensa per aver eliminato i goblin. La fabbra Mira aveva chiesto di recuperare il martello runico."* Marco legge, si sente sicuro, e improvvisa la scena con naturalezza.

**Climax:** Un giocatore chiede una regola su Grapple in combattimento. Marco clicca "Rules Q&A" e in 2 secondi ha la risposta con il riferimento al compendio. Non deve interrompere il flusso di gioco per cercare nel manuale.

**Resolution:** Fine sessione, 23:30. Marco preme "Stop". VoxChronicle mostra un pulsante "Process Session". Clicca, va a dormire. Il giorno dopo trova su Kanka un riassunto narrativo della sessione con le entita' estratte e 3 immagini delle scene salienti. Condivide il link nel gruppo WhatsApp — i giocatori sono entusiasti.

### Journey 2: Marco, il DM — Primo Setup e Configurazione

Marco ha appena scoperto VoxChronicle e lo installa per la prima volta.

**Opening Scene:** Marco installa il modulo da Foundry, lo attiva. Apre le impostazioni del modulo. Vede una sezione chiara: "API Keys" con campi per OpenAI e Kanka, ognuno con un link diretto alla pagina di creazione del token.

**Rising Action:** Inserisce la API key OpenAI. Nella sezione "AI Provider" vede un dropdown con OpenAI preselezionato e le opzioni Claude e Gemini grayed-out con la scritta "Inserisci API key per attivare". Per ora usa solo OpenAI. Configura il Campaign ID di Kanka seguendo le istruzioni inline.

**Climax:** Apre il pannello VoxChronicle. La UI mostra due grandi pulsanti: "Live Session" e "Chronicle Mode" con una breve descrizione sotto ciascuno. Nessun menu nascosto, nessun tab confuso. Marco capisce immediatamente cosa fare.

**Resolution:** Fa un test di 5 minuti — registra, trascrive, vede le entita' estratte. Tutto funziona. Si sente pronto per la sessione di venerdi'.

### Journey 3: Marco come DM Tecnico — Configurazione Avanzata e Multi-Provider

Marco vuole ottimizzare il sistema usando Claude Opus per i riassunti (piu' narrativi) e GPT-5.4 per i suggerimenti live (piu' veloce).

**Opening Scene:** Marco apre le impostazioni avanzate. Nella sezione "AI Provider" vede una tabella chiara: ogni tipo di task (Suggerimenti Live, Riassunto Sessione, Estrazione Entita', Rules Q&A, Generazione Immagini) ha il suo dropdown di modello.

**Rising Action:** Inserisce la API key Anthropic. I dropdown per Claude si sbloccano. Assegna Claude Opus ai riassunti, lascia GPT-5.4 per i suggerimenti live (velocita'), e Gemini per l'estrazione entita'. Per le immagini resta su gpt-image-1 (unica opzione).

**Climax — RAG multi-provider:** Marco nota che anche il RAG puo' essere configurato per provider. Invece di usare solo OpenAI File Search, sceglie di usare Claude come backend RAG per i journal della campagna — la context window ampia di Claude permette di iniettare piu' contesto senza chunking. Per i compendi delle regole, mantiene OpenAI File Search che ha gia' il vector store indicizzato. Puo' anche configurare RAGFlow self-hosted se vuole tenere i dati in locale.

**Resolution:** La sessione successiva e' notevolmente migliorata — i suggerimenti sono piu' veloci, i riassunti su Kanka hanno una qualita' narrativa superiore, e il contesto RAG e' piu' preciso perche' Claude gestisce meglio i documenti lunghi. Marco sente di avere il controllo completo dello strumento.

### Journey 4: DM — Sessione Problematica (Edge Case / Recovery)

Marco e' in sessione live e qualcosa va storto.

**Opening Scene:** A meta' sessione, la connessione internet di Marco ha un'interruzione di 30 secondi. L'audio continua a registrarsi localmente ma le chiamate API falliscono.

**Rising Action:** VoxChronicle mostra un indicatore giallo nella status bar: "Connessione AI temporaneamente non disponibile — la registrazione continua". I suggerimenti si fermano ma l'audio non si perde. Marco continua a giocare senza assistenza AI per qualche minuto.

**Climax:** La connessione torna. VoxChronicle riprende automaticamente le trascrizioni dal punto di interruzione. Un messaggio discreto conferma: "Connessione AI ripristinata". I suggerimenti ricominciano entro il ciclo successivo.

**Resolution:** A fine sessione, il processo chronicle funziona normalmente. La trascrizione ha una piccola lacuna di 30 secondi ma il riassunto AI compensa interpolando dal contesto. Marco non ha perso nulla di significativo.

### Journey 5: Marco, il DM — Analisi Post-Sessione e Ottimizzazione

Marco vuole analizzare i dati delle sessioni per migliorare il suo stile di gioco e ottimizzare VoxChronicle per la sua campagna.

**Opening Scene:** Il giorno dopo la sessione, Marco apre VoxChronicle e clicca sulla tab Analytics. Vede una dashboard con i dati della sessione precedente: partecipazione per speaker, timeline degli eventi, e capitoli/scene tracciate durante il gioco.

**Rising Action:** Marco nota che due giocatori hanno parlato molto meno degli altri. La timeline mostra che durante il combattimento con il drago, il bardo e il ranger sono rimasti in silenzio per 20 minuti. Marco prende nota — la prossima sessione dara' loro piu' spazio narrativo.

**Climax:** Marco configura un vocabolario personalizzato con i nomi dei luoghi e NPC della sua campagna (Thornfield, Aldric, Mira). La trascrizione successiva riconosce correttamente questi termini invece di approssimarli foneticamente. Cambia anche la lingua di trascrizione in italiano per il suo gruppo che gioca in italiano.

**Resolution:** Dopo 3 sessioni con vocabolario personalizzato e lingua corretta, la qualita' della trascrizione e' notevolmente migliorata. I suggerimenti contestuali usano i nomi corretti, e la cronaca su Kanka e' piu' accurata. Le analytics confermano un bilanciamento migliore della partecipazione.

### Journey Requirements Summary

| Journey | Capacita' Rivelate |
|---------|-------------------|
| **DM Live Session** | Suggerimenti contestuali <3s, Rules Q&A con compendio, Chronicle automatica post-sessione, Pubblicazione Kanka con immagini |
| **Primo Setup** | Onboarding guidato, UI con 2 modalita' chiare, Feedback immediato sulla configurazione, Test rapido funzionalita' |
| **DM Tecnico / Multi-Provider** | Selezione modello per-task, Multi-provider API keys, RAG multi-provider (OpenAI File Search, Claude context, RAGFlow self-hosted), Status indicatori per ogni provider |
| **Edge Case / Recovery** | Resilienza a disconnessioni, Registrazione locale indipendente da API, Ripresa automatica, Indicatori di stato con colore/icona per stato, Degradazione graceful |
| **Analisi e Ottimizzazione** | Analytics partecipazione speaker, Timeline eventi sessione, Tracciamento capitoli/scene, Vocabolari personalizzati per trascrizione, Configurazione lingua trascrizione |

## Domain-Specific Requirements

### Vincoli Piattaforma

- **Browser-only execution:** VoxChronicle gira interamente nel browser come modulo Foundry VTT v13. Nessun backend custom, nessun server-side processing. Ogni chiamata API parte dal client JavaScript
- **API keys client-side:** Le chiavi API sono memorizzate in localStorage (scope client). Ogni utente gestisce le proprie credenziali per OpenAI, Anthropic, Google, e Kanka

### Vincoli Economici

- **Costo diretto per l'utente:** L'utente paga le API AI dal proprio account. Ogni chiamata duplicata o cache miss e' un costo reale. L'ottimizzazione delle performance e' anche ottimizzazione economica
- **Budget tipico sessione:** ~$1-2 per sessione di 3 ore (trascrizione + suggerimenti + immagini). Superare questo range rende il prodotto non sostenibile per l'utente medio

### Vincoli Real-Time

- **Ciclo live ~30 secondi:** In Live Mode, il ciclo completo (cattura audio -> trascrizione -> analisi -> suggerimento) deve completarsi entro il ritmo naturale del gioco. Se l'AI e' piu' lenta del gioco, diventa inutile
- **Latenza target <3 secondi:** Il suggerimento deve apparire entro 3 secondi dalla fine della trascrizione del chunk corrente

### Vincoli RAG

- **RAG multi-provider:** Il sistema RAG deve supportare backend multipli — OpenAI File Search (vector store), Claude/Gemini (context window ampia per document injection), RAGFlow (self-hosted). Il DM sceglie il backend RAG piu' adatto al suo caso d'uso
- **Contenuto RAG da Foundry:** I documenti per il RAG provengono dai journal e compendi di Foundry VTT — il parser deve gestire il formato HTML/Foundry e estrarre testo significativo

## Innovation & Novel Patterns

### Analisi First Principles

**Assunzioni sfidate:**
1. L'AI deve suggerire attivamente al DM cosa fare
2. Il ciclo live deve essere periodico (~30s chunk)
3. Il RAG serve solo per recuperare informazioni dai journal
4. La cronaca e' un riassunto post-sessione batch
5. Il DM legge i suggerimenti su un pannello laterale
6. Ogni sessione e' indipendente — l'AI riparte da zero
7. L'AI e' uno strumento passivo — il DM chiede, l'AI risponde

### Aree di Innovazione Rilevate

#### 1. Cronaca Vivente (Streaming Chronicle)
La cronaca si costruisce **durante** la sessione. Ogni scena trascritta e riassunta in tempo reale, cosi' a fine sessione la cronaca e' gia' pronta — zero post-processing. Il DM preme "Pubblica" e trova tutto su Kanka.
- **Fattibilita':** Alta — quasi possibile con il ciclo live attuale
- **Impatto:** Alto — elimina il collo di bottiglia post-sessione
- **Unicita':** Alta — nessun modulo TTRPG offre chronicle streaming

#### 2. Knowledge Graph della Campagna
L'AI mantiene un **grafo di conoscenza persistente** che cresce sessione dopo sessione. Non solo recupero informazioni, ma comprensione delle relazioni tra eventi, NPC, luoghi — una memoria della campagna che il DM non ha.
- **Fattibilita':** Bassa nel breve termine — richiede architettura nuova
- **Impatto:** Molto Alto — trasforma l'AI da strumento a compagno di campagna
- **Unicita':** Alta — nessun assistente TTRPG ha memoria cross-sessione strutturata

#### 3. Copilot Predittivo
L'AI non risponde a domande ma **anticipa** i bisogni. Vedendo che i giocatori si dirigono verso Thornfield, prepara automaticamente il contesto di Thornfield PRIMA che il DM ne abbia bisogno.
- **Fattibilita':** Media — richiede intent detection dal flusso narrativo
- **Impatto:** Molto Alto — il suggerimento giusto al momento giusto
- **Unicita':** Alta — da reattivo a predittivo nel dominio TTRPG

#### 4. Event-Driven Reactivity
Il trigger non e' un timer 30s ma **eventi narrativi**: cambio scena, menzione NPC, domanda di regole. L'AI si attiva solo quando rileva un evento significativo, riducendo rumore e costo.
- **Fattibilita':** Media — richiede NLP per event detection
- **Impatto:** Alto — meno rumore, piu' precisione, meno costi API
- **Unicita':** Media — pattern esistente in altri domini, nuovo per TTRPG

#### 5. Ambient Intelligence
L'AI non suggerisce mai attivamente ma prepara un **contesto silenzioso** sempre disponibile. Come appunti che si aggiornano da soli — il DM guarda quando vuole, non viene interrotto.
- **Fattibilita':** Alta — cambio di UX, non di tecnologia
- **Impatto:** Medio — riduce il carico cognitivo
- **Unicita':** Bassa — esiste in altri domini

### Roadmap Innovazione

| Orizzonte | Pattern | Stato |
|-----------|---------|-------|
| **MVP (breve termine)** | Ambient Intelligence + Event-Driven base | Fattibile con tech attuale |
| **Growth (medio termine)** | Cronaca Vivente + Event-Driven completo | Evoluzione del ciclo live |
| **Vision (lungo termine)** | Knowledge Graph + Copilot Predittivo | Richiede architettura nuova |

### Validazione

- **Cronaca Vivente:** Prototipabile estendendo il ciclo live esistente — aggiungere riassunto progressivo per scena e accumulo in un journal draft
- **Event-Driven:** Testabile con un classificatore semplice (keyword-based) prima di investire in NLP
- **Knowledge Graph:** Validabile iniziando con un grafo relazioni entita' persistito su Foundry journal flags
- **Copilot Predittivo:** Proxy iniziale con pre-fetch dei journal collegati alla scena corrente

### Mitigazione Rischi

- **Cronaca Vivente potrebbe produrre riassunti frammentati:** Mitigazione con passata di "unificazione narrativa" leggera a fine sessione
- **Event Detection potrebbe generare falsi positivi:** Mitigazione con soglia di confidenza configurabile e fallback al ciclo periodico
- **Knowledge Graph potrebbe crescere senza controllo:** Mitigazione con decay temporale e peso delle relazioni
- **Copilot Predittivo potrebbe anticipare male:** Mitigazione con approccio "prepara ma non mostra" — il contesto e' pronto ma visibile solo su richiesta

## Web App Specific Requirements

### Project-Type Overview

VoxChronicle e' un modulo client-side che gira dentro Foundry VTT v13 come pannello ApplicationV2 con tab switching interno (pattern SPA-like). Non e' un sito web standalone ma un componente UI embedded nel canvas di gioco. Tutte le interazioni avvengono dentro il pannello floating e i dialog modali di Foundry.

### Browser Support Matrix

| Browser | Supporto | Note |
|---------|----------|------|
| Chrome (latest) | Primario | Target principale, pieno supporto MediaRecorder + WebRTC |
| Edge (Chromium) | Primario | Stessa engine di Chrome, comportamento identico |
| Safari (latest) | Secondario | Limitazioni MediaRecorder (codec WebM), richiede fallback a MP4/AAC |
| Opera (latest) | Secondario | Chromium-based, comportamento simile a Chrome |
| Firefox | Best-effort | Supportato da Foundry ma non target primario per VoxChronicle |

Considerazioni Safari: il codec WebM/Opus non e' supportato nativamente. AudioRecorder deve implementare fallback a MP4/AAC o WAV per garantire registrazione funzionante.

### Real-Time Architecture

#### A. Aggiornamento UI Chirurgico
Il pannello deve aggiornare solo gli elementi DOM che cambiano (suggerimento, trascrizione, analytics) invece di ri-renderizzare l'intero pannello ad ogni ciclo. Questo elimina flickering e migliora la fluidita' percepita durante la sessione live.

#### B. Event Bus Interno (Pub/Sub)
I servizi devono comunicare tramite un event bus interno (pub/sub pattern) invece di callback diretti. I servizi emettono eventi tipizzati, la UI si sottoscrive. Questo disaccoppia i componenti, abilita il pattern event-driven reactivity (dalla sezione Innovation), e permette a moduli esterni di sottoscriversi agli eventi VoxChronicle.

#### C. Streaming Risposte AI
Le risposte AI (suggerimenti, rules Q&A, riassunti) devono essere mostrate in streaming token-per-token via SSE (Server-Sent Events) dall'API. Il DM inizia a leggere immediatamente mentre la risposta completa si genera, riducendo la latenza percepita.

#### D. Ciclo Adattivo
Il ciclo di cattura audio deve essere adattivo: chunk piu' corti (~15s) durante conversazioni intense con alta attivita' vocale, chunk piu' lunghi (~45-60s) durante pause o bassa attivita'. Questo migliora la reattivita' nei momenti critici e riduce chiamate API inutili durante le pause.

### Accessibility Target: WCAG 2.1 Level AAA

VoxChronicle punta a conformita' WCAG 2.1 Level AAA come target di accessibilita':

- **Navigazione tastiera completa:** Tutti i controlli, tab, pulsanti e dialog raggiungibili e operabili via tastiera con ordine logico
- **ARIA completo:** roles (tablist, tab, tabpanel), states (aria-selected, aria-expanded, aria-live), labels su ogni elemento interattivo
- **Contrasto alto (7:1):** Tutti i testi e gli elementi UI devono rispettare il rapporto di contrasto AAA
- **Focus ring visibile:** Indicatore di focus chiaro e ad alto contrasto su ogni elemento interattivo
- **Screen reader support:** Status messages (suggerimenti, errori, progresso) annunciate via aria-live regions
- **Nessun contenuto lampeggiante:** Indicatori di stato usano colore solido o animazioni dolci, mai flash
- **Linguaggio chiaro:** Labels e messaggi UI formulati in modo semplice e diretto
- **Testo ridimensionabile:** L'UI deve rimanere funzionale con zoom browser fino a 200%

Nota: Foundry VTT stesso non e' completamente WCAG AAA compliant, quindi il target e' la massima conformita' raggiungibile nei limiti di Foundry VTT.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Approccio:** Experience MVP (Stabilizzazione + Quick Win)
Risolvere i problemi esistenti E mostrare il futuro con 1-2 feature ad alto impatto che cambiano l'esperienza percepita. "Prima fallo funzionare bene, poi fallo fare di piu' — ma mostra subito dove si va."

**Risorse:** Sviluppo solo/piccolo team. L'MVP e' dimensionato per essere completabile da uno sviluppatore dedicato.

### MVP Feature Set (Phase 1)

**Core User Journeys Supportati:** Journey 1 (DM Live Session), Journey 2 (Primo Setup), Journey 4 (Recovery da errori)

**Must-Have:**

1. Fix 3 bug critici (hook morti in main.mjs, _hooksRegistered mai dichiarato, _aiSuggestionHealth non aggiornato)
2. Fix 7 bug importanti dall'audit (AbortController leak, reinitialize concorrente, reindexQueue overwrite, shutdownController, enrichSession, prepareContext mutation, Process Session state check)
3. Parallelizzazione OpenAIClient — code per-tipo invece della coda globale sequenziale
4. Cache nei percorsi caldi — CacheManager attivo su RAG query, regole lookup, suggerimenti (riduzione API calls duplicate >= 50%)
5. Streaming risposte AI (SSE) — suggerimenti e rules Q&A mostrati token-per-token, latenza percepita drasticamente ridotta
6. Event bus interno (pub/sub) — servizi emettono eventi tipizzati, UI si sottoscrive, disaccoppiamento completo tra servizi e presentazione
7. AI Provider Interface — interfaccia astratta AIProvider con implementazione OpenAI come primo provider, pronto per multi-provider
8. UI cleanup — rimozione template orfani (recorder.hbs), CSS namespacing completo, tab analytics collegato a dati reali
9. Journal reading fix — suggerimenti contestuali basati sui journal selezionati dall'utente, non generici
10. Safari codec fallback — fallback MP4/AAC per garantire registrazione su Safari

### Post-MVP Features

**Phase 2 (Growth):**

1. Provider Claude (Sonnet/Opus) come secondo provider AI
2. Provider Gemini come terzo provider AI
3. Selezione modello per-task — UI per scegliere quale modello per ogni operazione (suggerimenti, riassunti, regole, estrazione, immagini)
4. Ciclo adattivo (VAD-based) — chunk audio dinamici basati su attivita' vocale
5. Cronaca Vivente — riassunto progressivo per scena durante la sessione, cronaca pronta a fine sessione senza post-processing
6. Analytics tab completo — dashboard sessione con dati reali di SessionAnalytics
7. WCAG AAA audit e fix sistematico di tutti i componenti UI

**Phase 3 (Vision):**

1. Knowledge Graph persistente della campagna — grafo di conoscenza cross-sessione
2. Copilot Predittivo — anticipazione dei bisogni del DM basata su intent detection
3. Modelli locali (Ollama) — provider per modelli self-hosted per privacy totale
4. Pacchetto premium FoundryVTT Store — distribuzione commerciale con licensing
5. Multi-lingua AI avanzata con vocabolario RPG specifico per lingua
6. Importazione audio esterna (Discord, file caricati)
7. Template cronache personalizzabili — stili narrativi configurabili per Kanka

### Risk Mitigation Strategy

**Rischi Tecnici:**
- Event bus e' modifica trasversale — implementarlo per primo, validare con 2-3 servizi prima di migrare tutto
- Streaming AI + event bus simultanei — sequenzializzare: event bus prima, streaming dopo
- Safari fallback — test matrix su Safari 16+ con feature detection progressiva
- AI Provider Interface — validare l'astrazione con OpenAI prima di aggiungere Claude

**Rischi di Mercato:**
- Nicchia ristretta (DM + Foundry + AI) — rilasciare MVP presto, raccogliere feedback su FoundryVTT Discord e Reddit prima di investire in multi-provider
- Costo API potrebbe scoraggiare utenti — cache aggressiva e ciclo adattivo riducono costi a regime

**Rischi di Risorse:**
- Sviluppo solo — se le risorse si riducono, priorita' interna: stabilizzazione (1-4) prima, architettura (5-7) poi, UX (8-10) alla fine
- MVP core (bug fix + performance + cache) e' fattibile anche senza event bus e streaming come fallback minimo

## Functional Requirements

### Audio Capture & Recording

- FR1: Il DM puo' avviare e arrestare la registrazione audio della sessione
- FR2: Il DM puo' mettere in pausa e riprendere la registrazione durante le pause di gioco
- FR3: Il sistema puo' catturare audio dal microfono del browser o dal WebRTC di Foundry VTT
- FR4: Il sistema puo' registrare audio su Safari tramite fallback codec MP4/AAC
- FR5: Il sistema puo' suddividere automaticamente registrazioni superiori a 25MB in chunk
- FR6: Il DM puo' visualizzare la durata e lo stato della registrazione in corso

### Transcription & Speaker Identification

- FR7: Il sistema puo' trascrivere l'audio della sessione con identificazione degli speaker
- FR8: Il DM puo' mappare gli ID speaker (SPEAKER_00, SPEAKER_01) ai nomi dei giocatori
- FR9: Il DM puo' visualizzare e revisionare la trascrizione completa con nomi speaker
- FR10: Il sistema puo' trascrivere in almeno 8 lingue (en, it, de, es, fr, ja, pt + configurabili dall'utente)

### Live Session AI Assistance

- FR11: Il DM puo' avviare una sessione live con assistenza AI in tempo reale
- FR12: Il sistema puo' generare suggerimenti contestuali basati sulla trascrizione corrente e sui journal selezionati
- FR13: Il DM puo' consultare le regole D&D con risposte basate sui compendi di Foundry
- FR14: Il sistema puo' rilevare il tipo di scena corrente (combattimento, sociale, esplorazione, riposo)
- FR15: Il sistema puo' mostrare le risposte AI in streaming token-per-token
- FR16: Il sistema puo' adattare il ciclo di cattura audio in base all'attivita' vocale
- FR17: Il DM puo' selezionare i journal di Foundry da usare come contesto per i suggerimenti

### Chronicle Generation

- FR18: Il sistema puo' estrarre entita' (NPC, luoghi, oggetti) dalla trascrizione
- FR19: Il DM puo' revisionare, modificare e selezionare le entita' prima della pubblicazione
- FR20: Il sistema puo' generare immagini AI per scene con piu' di 3 turni di dialogo o in corrispondenza di un cambio scena
- FR21: Il sistema puo' formattare la trascrizione come cronaca narrativa
- FR22: Il DM puo' pubblicare cronache, entita' e immagini su Kanka

### AI Provider Management

- FR23: Il DM puo' configurare API keys per provider AI multipli (OpenAI, Anthropic, Google)
- FR24: Il DM puo' selezionare quale provider AI usare per ogni tipo di operazione
- FR25: Il sistema puo' supportare provider AI intercambiabili senza modifiche al codice di business
- FR26: Il DM puo' visualizzare lo stato di connessione di ogni provider configurato

### RAG & Knowledge Management

- FR27: Il sistema puo' indicizzare i journal di Foundry per il retrieval contestuale
- FR28: Il sistema puo' indicizzare i compendi di Foundry per le ricerche di regole
- FR29: Il DM puo' scegliere il backend RAG (OpenAI File Search, RAGFlow, o altri)
- FR30: Il sistema puo' arricchire i suggerimenti AI con contesto dalla knowledge base della campagna (journal e compendi)

### Session Analytics

- FR31: Il DM puo' visualizzare statistiche di partecipazione degli speaker durante la sessione
- FR32: Il DM puo' visualizzare una timeline degli eventi della sessione
- FR33: Il sistema puo' tracciare capitoli e scene durante la sessione live

### UI & Configuration

- FR34: Il DM puo' accedere a tutte le funzionalita' tramite un pannello floating unificato con tab
- FR35: Il DM puo' configurare tutte le impostazioni del modulo tramite le impostazioni di Foundry
- FR36: Il DM puo' ricevere notifiche in tempo reale sugli eventi della sessione (nuova trascrizione, suggerimento pronto, errore) senza ricaricare il pannello
- FR37: Il DM puo' navigare l'intera UI tramite tastiera
- FR38: Il sistema puo' annunciare aggiornamenti di stato agli screen reader tramite ARIA live regions
- FR39: Il DM puo' gestire vocabolari personalizzati per migliorare l'accuratezza della trascrizione

### Error Handling & Resilience

- FR40: Il sistema puo' continuare la registrazione audio durante interruzioni di connessione API
- FR41: Il sistema puo' riprendere automaticamente le operazioni AI dopo il ripristino della connessione
- FR42: Il DM puo' visualizzare indicatori di stato con colore e icona distintivi per ogni stato (connesso, disconnesso, errore, in attesa) per connessione AI e registrazione
- FR43: Il sistema puo' degradare gracefully disabilitando le funzionalita' AI mantenendo la registrazione

## Non-Functional Requirements

### Performance

- NFR1: I suggerimenti AI live devono apparire entro 3 secondi (p95) dalla fine della trascrizione del chunk corrente
- NFR2: Le risposte rules Q&A devono iniziare lo streaming entro 1 secondo dalla richiesta
- NFR3: Il pannello UI deve aggiornarsi con zero re-render completi del pannello per ciclo live, aggiornando solo gli elementi DOM modificati
- NFR4: La trascrizione di un chunk audio di 30 secondi deve completarsi entro 5 secondi
- NFR5: Le operazioni di cache (hit/miss) devono completarsi entro 10ms
- NFR6: L'indicizzazione RAG di 100 journal deve completarsi entro 60 secondi
- NFR7: Il costo API per sessione di 3 ore deve rimanere sotto i $2 con cache attiva

### Security

- NFR8: Le API keys devono essere memorizzate localmente per utente, mai trasmesse a server terzi oltre al provider destinatario
- NFR9: Le API keys non devono mai apparire nei log (SensitiveDataFilter attivo su tutti i canali di logging)
- NFR10: L'audio registrato deve essere processato in-browser e inviato solo all'API di trascrizione configurata, senza storage persistente locale
- NFR11: I dati delle entita' devono essere pubblicati su Kanka solo dopo conferma esplicita dell'utente
- NFR12: Il contenuto AI mostrato nel pannello deve essere sanitizzato per prevenire XSS injection
- NFR13: Le connessioni API devono usare esclusivamente HTTPS

### Scalability

- NFR14: Il sistema RAG deve gestire l'indicizzazione di almeno 500 journal di Foundry con latenza di query inferiore a 200ms (p95)
- NFR15: Il Knowledge Graph (Phase 3) deve supportare almeno 100 sessioni accumulate con latenza di ricerca inferiore a 500ms (p95)
- NFR16: Il ciclo live deve mantenere la latenza target (<3s) indipendentemente dalla lunghezza della sessione (fino a 8 ore)
- NFR17: Il sistema di cache deve gestire almeno 1000 entry con overhead di memoria inferiore a 50MB
- NFR18: L'architettura event bus deve supportare almeno 50 subscriber concorrenti con overhead di dispatch inferiore a 1ms per evento
- NFR19: L'AI Provider Interface deve supportare l'aggiunta di nuovi provider senza modifiche al codice chiamante

### Accessibility

- NFR20: L'UI deve conformarsi a WCAG 2.1 Level AAA nei limiti della piattaforma Foundry VTT host
- NFR21: Tutti i rapporti di contrasto testo/sfondo devono essere almeno 7:1 (AAA)
- NFR22: Tutti gli elementi interattivi devono essere raggiungibili e operabili tramite sola tastiera
- NFR23: Tutti gli aggiornamenti di stato (suggerimenti, errori, progresso) devono essere annunciati via aria-live regions
- NFR24: L'UI deve rimanere funzionale con zoom browser fino a 200%
- NFR25: Nessun elemento dell'interfaccia deve lampeggiare piu' di 3 volte al secondo

### Integration

- NFR26: Il sistema deve supportare le API OpenAI, Anthropic e Google tramite un'interfaccia comune
- NFR27: Le integrazioni API devono gestire rate limiting con retry automatico e backoff progressivo
- NFR28: Le integrazioni Kanka devono rispettare i limiti di 30 req/min (free) e 90 req/min (premium) tramite throttling
- NFR29: Il circuit breaker deve aprirsi dopo 5 fallimenti consecutivi e chiudersi automaticamente dopo 60 secondi di cooldown
- NFR30: L'integrazione con Foundry VTT deve essere compatibile con la versione v13 e mantenere compatibilita' con le API ApplicationV2
- NFR31: Il backend RAG deve essere intercambiabile (OpenAI File Search, RAGFlow, altri) senza impatto sui servizi consumatori
- NFR31b: I servizi interni devono comunicare tramite un sistema di eventi disaccoppiato (pub/sub) per abilitare estensibilita' e reattivita' event-driven

### Reliability

- NFR32: La registrazione audio deve continuare senza interruzioni durante failure delle API esterne
- NFR33: Il sistema deve riprendere automaticamente le operazioni AI entro 30 secondi dal ripristino della connessione
- NFR34: Nessuna perdita di dati audio in caso di crash del browser durante la registrazione (chunk salvati progressivamente)
- NFR35: Il processo chronicle deve essere ripetibile — se fallisce a meta', deve poter riprendere dallo step fallito senza riprocessare tutto
- NFR36: Il sistema deve mantenere uno stato consistente dopo qualsiasi errore (nessun stato corrotto che richieda refresh manuale)
- NFR37: Il tempo medio tra failure critiche (MTBF) durante una sessione live deve essere superiore a 4 ore
