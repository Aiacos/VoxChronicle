# RAG System Testing Guide

This guide provides comprehensive instructions for testing the VoxChronicle RAG (Retrieval-Augmented Generation) system using real adventure content.

## 📚 Official Adventure Excerpts for Testing

The following excerpts from official D&D 5e adventures can be used to test RAG context retrieval and suggestion generation:

### Lost Mine of Phandelver

**Chapter 1: Goblin Arrow**
```
The adventure begins with the characters on the road to Phandalin. They are waylaid by goblins
who have been sent by King Grol to capture Sildar Hallwinter. The goblins ambush the party,
firing arrows from the trees. If the characters defeat the goblins, they can question a survivor
who reveals that the goblins are based in Cragmaw Hideout and that their leader, Klarg, has
captured Sildar Hallwinter.
```

**Chapter 2: Phandalin**
```
Phandalin is a rough-and-tumble frontier town that has seen better days. Once a bustling
community, it was abandoned decades ago after orcs raided and destroyed most of the town.
Recently, prospectors rediscovered veins of gold and silver in the area, and Phandalin is now
experiencing a mini gold rush. The town is governed by Harbin Wester, a corrupt and cowardly
townmaster who takes bribes from the Redbrands, a local gang.
```

**NPCs:**
- **Sildar Hallwinter**: A middle-aged human warrior with short gray hair and a neatly trimmed beard. Member of the Lords' Alliance sent to establish order in Phandalin.
- **Gundren Rockseeker**: A male dwarf prospector who rediscovered the lost mine of Phandelver.

**Locations:**
- **Cragmaw Hideout**: A natural cave expanded into a crude goblin fortress, hidden behind a waterfall.

### Curse of Strahd

**Chapter 1: Death House**
```
The adventure begins with the characters arriving in the village of Barovia, a land shrouded
in perpetual mist. They are drawn to a dilapidated mansion known as Death House, where they
encounter undead creatures and uncover the dark history of the Durst family.
```

**NPCs:**
- **Count Strahd von Zarovich**: Ancient vampire lord who rules Barovia with an iron fist. Charming, intelligent, and ruthless.

### Dragon of Icespire Peak

**Chapter 1: The Dragon Attacks**
```
A young white dragon named Cryovain has taken up residence in Icespire Peak and begun
terrorizing the region. The dragon attacks Phandalin, demanding tribute from the townsfolk.
```

**Creatures:**
- **Cryovain**: Young white dragon with iridescent scales. Arrogant and cruel but not particularly intelligent.

## 🧪 Test Scenarios

### 1. RAG Context Retrieval

**Test Case**: Goblin Ambush Scenario
- **Query**: "goblin ambush"
- **Expected Context**: Should retrieve information about Klarg, Cragmaw Hideout, and Sildar Hallwinter
- **Expected Sources**: Chapter 1 content with goblin ambush details

**Test Case**: NPC Information
- **Query**: "Sildar Hallwinter"
- **Expected Context**: Should retrieve Sildar's description, affiliation, and role
- **Expected Sources**: NPC section with Sildar's details

**Test Case**: Location Details
- **Query**: "Cragmaw Hideout"
- **Expected Context**: Should retrieve cave description, waterfall entrance, and layout
- **Expected Sources**: Locations section with hideout details

### 2. AI Analysis with RAG Context

**Test Case**: Contextual Suggestions
- **Transcription**: "The party approaches a dense forest area"
- **Expected RAG Context**: Goblin ambush information from Chapter 1
- **Expected Suggestion**: "Goblins are hiding in the trees. Suggest sending a scout ahead or setting up a counter-ambush."
- **Expected Type**: "action"

**Test Case**: Off-Track Detection
- **Transcription**: "The party spends hours arguing with Harbin Wester about town governance"
- **Expected RAG Context**: Phandalin town description and main quest details
- **Expected Detection**: Off-track with severity 0.6-0.8
- **Expected Reason**: "Players are ignoring the main quest to deal with town politics"

**Test Case**: Narrative Bridging
- **Current Scene**: "The party is in Phandalin arguing with the townmaster"
- **Target Scene**: "The party needs to find Cragmaw Hideout"
- **Expected Bridge**: "While dealing with the corrupt townmaster is important, remember that Sildar Hallwinter was kidnapped by goblins from Cragmaw Hideout. The trail might go cold if you delay too long."

### 3. Cross-Adventure Context

**Test Case**: Adventure Switching
1. Set context to Lost Mine of Phandelver
2. Query "goblin ambush" → Should return Phandelver-specific results
3. Switch context to Curse of Strahd
4. Query "haunted mansion" → Should return Strahd-specific results
5. **Expected**: Both queries should return relevant, adventure-specific context

### 4. Error Handling

**Test Case**: RAG Service Unavailable
- **Setup**: Simulate RAG API failure
- **Query**: Any valid query
- **Expected Behavior**: Graceful degradation with empty RAG context
- **Expected Fallback**: AI should still generate suggestions using adventure context

**Test Case**: Network Errors
- **Setup**: Simulate network timeout
- **Query**: Any valid query
- **Expected Behavior**: No errors thrown, empty RAG result returned
- **Expected UI**: User notification about RAG unavailability

## 🔧 Manual Testing Setup

### Prerequisites
1. Foundry VTT installed with VoxChronicle module
2. OpenAI API key configured in module settings
3. Adventure journals created in Foundry with the test content above

### Test Procedure

1. **Configure Adventure Journal**:
   - Create a new journal entry in Foundry
   - Add the adventure content from above
   - Set as active adventure in VoxChronicle settings

2. **Enable Debug Logging**:
   ```javascript
   // In browser console
   game.modules.get('vox-chronicle').api.setDebugMode(true);
   ```

3. **Execute Test Queries**:
   ```javascript
   // Access the RAG provider
   const voxChronicle = game.modules.get('vox-chronicle').api;
   const ragProvider = voxChronicle.getRAGProvider();
   
   // Execute test query
   const result = await ragProvider.query('goblin ambush');
   console.log('RAG Result:', result);
   ```

4. **Verify AI Analysis**:
   ```javascript
   const aiAssistant = voxChronicle.getAIAssistant();
   const analysis = await aiAssistant.analyzeContext('The party enters a forest');
   console.log('AI Analysis:', analysis);
   ```

### Expected Results

**Successful RAG Query:**
```json
{
  "answer": "Goblins led by Klarg ambushed the party near Phandalin",
  "sources": [
    {
      "title": "Chapter 1: Goblin Arrow",
      "excerpt": "The party is ambushed by goblins led by Klarg...",
      "score": 0.95,
      "documentId": "journal_lost_mine_chapter1"
    }
  ]
}
```

**Successful AI Analysis:**
```json
{
  "suggestions": [
    {
      "type": "action",
      "content": "Goblins are hiding in the trees. Suggest sending a scout ahead...",
      "confidence": 0.92
    }
  ],
  "offTrack": {
    "isOffTrack": false,
    "severity": 0,
    "reason": "Following the main quest"
  },
  "rulesQuestions": [],
  "usage": {
    "prompt_tokens": 120,
    "completion_tokens": 60,
    "total_tokens": 180
  }
}
```

## 📊 Performance Metrics

### Key Metrics to Measure

1. **RAG Retrieval Latency**: Time from query to context return
   - **Target**: < 500ms for cached results, < 2000ms for new queries

2. **Context Relevance Score**: Average relevance of retrieved sources
   - **Target**: > 0.85 for direct matches, > 0.7 for related content

3. **Suggestion Quality**: Human evaluation of suggestion usefulness
   - **Scale**: 1-5 (1=irrelevant, 5=perfectly contextual)
   - **Target**: Average score > 4.0

4. **Off-Track Detection Accuracy**: Correct identification of off-track scenarios
   - **Target**: > 90% accuracy with < 10% false positives

### Benchmarking Script

```javascript
// Benchmark RAG performance
async function benchmarkRAG(queries, iterations = 5) {
  const results = [];
  
  for (const query of queries) {
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const result = await ragProvider.query(query);
      const end = performance.now();
      
      times.push(end - start);
      results.push({
        query,
        iteration: i + 1,
        timeMs: end - start,
        contextLength: result.answer.length,
        sourceCount: result.sources.length
      });
    }
  }
  
  // Calculate averages
  const avgTime = results.reduce((sum, r) => sum + r.timeMs, 0) / results.length;
  const avgContext = results.reduce((sum, r) => sum + r.contextLength, 0) / results.length;
  
  console.log(`RAG Benchmark Results (${iterations} iterations):`);
  console.log(`- Average latency: ${avgTime.toFixed(2)}ms`);
  console.log(`- Average context length: ${avgContext.toFixed(0)} chars`);
  console.log(`- Total queries: ${results.length}`);
  
  return results;
}

// Usage
const testQueries = [
  'goblin ambush',
  'Sildar Hallwinter',
  'Cragmaw Hideout',
  'Phandalin townmaster',
  'Klarg the bugbear'
];

benchmarkRAG(testQueries).then(results => {
  // Save to file or analyze further
  console.log('Benchmark complete:', results);
});
```

## 🐛 Common Issues and Solutions

### Issue: RAG Returns Empty Results
**Possible Causes:**
- Vector store not properly initialized
- Adventure journal not indexed
- API key not configured

**Solutions:**
1. Verify vector store initialization:
   ```javascript
   const status = await ragProvider.getStatus();
   console.log('RAG Status:', status);
   ```
2. Check indexing status:
   ```javascript
   const indexStatus = await ragProvider.getIndexStatus();
   console.log('Index Status:', indexStatus);
   ```
3. Verify API configuration:
   ```javascript
   const config = voxChronicle.getConfiguration();
   console.log('OpenAI Config:', config.openai);
   ```

### Issue: Suggestions Are Generic (No RAG Context)
**Possible Causes:**
- RAG query failed silently
- Context not properly passed to AI
- Adventure context not set

**Solutions:**
1. Check RAG failure logs:
   ```javascript
   const logs = voxChronicle.getLogs();
   console.log(logs.filter(log => log.includes('RAG')));
   ```
2. Verify adventure context:
   ```javascript
   const context = aiAssistant.getAdventureContext();
   console.log('Adventure Context:', context);
   ```
3. Test RAG directly:
   ```javascript
   const ragResult = await ragProvider.query('test');
   console.log('Direct RAG Test:', ragResult);
   ```

### Issue: Off-Track Detection Not Working
**Possible Causes:**
- No adventure context set
- Current scene not tracked
- RAG context insufficient

**Solutions:**
1. Set explicit adventure context:
   ```javascript
   await aiAssistant.setAdventureContext({
     title: 'Lost Mine of Phandelver',
     chapters: { /* chapter data */ }
   });
   ```
2. Update scene tracking:
   ```javascript
   await aiAssistant.updateScene('forest', 'The party enters a forest');
   ```
3. Check context availability:
   ```javascript
   const hasContext = aiAssistant.hasAdventureContext();
   console.log('Has context:', hasContext);
   ```

## 🎯 Test Validation Checklist

- [ ] RAG provider properly initialized
- [ ] Vector store created and validated
- [ ] Adventure journal indexed
- [ ] Context retrieval returns relevant sources
- [ ] AI analysis incorporates RAG context
- [ ] Suggestions are adventure-specific
- [ ] Off-track detection works correctly
- [ ] Error handling is graceful
- [ ] Performance meets targets
- [ ] Cross-adventure context switching works

## 📚 Additional Resources

- **OpenAI File Search API**: https://platform.openai.com/docs/api-reference/files
- **RAG Best Practices**: https://platform.openai.com/docs/guides/rag
- **Foundry VTT Module Development**: https://foundryvtt.com/api/

## 🔄 Version History

**v1.0** - Initial release with Lost Mine of Phandelver, Curse of Strahd, and Dragon of Icespire Peak excerpts
**v1.1** - Added performance benchmarking script and troubleshooting guide
**v1.2** - Added validation checklist and additional test scenarios

This testing guide provides a comprehensive framework for validating the VoxChronicle RAG system using realistic adventure content and scenarios.