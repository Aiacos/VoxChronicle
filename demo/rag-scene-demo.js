/**
 * RAG System Demo - Descriptive Scene Processing
 * This demonstrates how the VoxChronicle RAG system would process the descriptive scene
 */

// The descriptive scene from the adventure
const DESCRIPTIVE_SCENE = `The gravel road leads to a village, its tall houses dark as tombstones. Nestled among these solemn dwellings are a handful of closed-up shops. Even the tavern is shut tight. A soft whimpering draws your eye toward a pair of children standing in the middle of an otherwise lifeless street.`;

// Simulated RAG context retrieval result
const ragContextResult = {
  answer: 'Abandoned village with eerie atmosphere. Children may be spirits or victims needing help.',
  sources: [
    {
      title: 'Horror Adventure Tropes',
      excerpt: 'Abandoned villages with ominous descriptions often hide dark secrets. Children found alone may be spirits, illusions, or victims needing rescue.',
      score: 0.92,
      documentId: 'horror-tropes'
    },
    {
      title: 'Village of Barovia',
      excerpt: 'The village of Barovia features tall, dark houses and an oppressive atmosphere. Children found alone may be lost souls or lures for darker forces.',
      score: 0.88,
      documentId: 'curse-of-strahd'
    }
  ]
};

// Simulated AI analysis result
const aiAnalysisResult = {
  suggestions: [
    {
      type: 'action',
      content: 'The eerie village and vulnerable children suggest a horror scenario. Approach cautiously - this could be a trap, illusion, or genuine distress. Check for signs of recent activity before engaging.',
      confidence: 0.91,
      pageReference: 'chapter1'
    },
    {
      type: 'investigation',
      content: 'Examine the village closely: look for tracks, signs of habitation, or clues about what happened. The children may provide important information.',
      confidence: 0.87
    },
    {
      type: 'dialogue',
      content: 'If approaching the children: ask about what happened to the village. Be prepared for cryptic or disturbing answers.',
      confidence: 0.85
    }
  ],
  offTrack: {
    isOffTrack: false,
    severity: 0.0,
    reason: 'This encounter aligns with the adventure theme and main quest'
  },
  sceneInfo: {
    type: 'exploration',
    atmosphere: 'eerie/horror',
    potentialThreats: ['traps', 'illusions', 'undead']
  },
  moodEnhancements: [
    'The gravel crunches unnaturally loud in the deathly silence',
    'The children\'s eyes reflect no light, like polished river stones',
    'A cold wind carries the scent of old graves and damp earth'
  ]
};

// Display the results
console.log('=== VoxChronicle RAG System Demo ===');
console.log('\n📝 Input Scene:');
console.log(DESCRIPTIVE_SCENE);

console.log('\n🔍 RAG Context Retrieval:');
console.log(`- Answer: ${ragContextResult.answer}`);
console.log('- Sources:');
ragContextResult.sources.forEach((source, index) => {
  console.log(`  ${index + 1}. ${source.title} (score: ${source.score})`);
  console.log(`     ${source.excerpt}`);
});

console.log('\n🎭 AI Analysis Results:');
console.log('- Suggestions:');
aiAnalysisResult.suggestions.forEach((suggestion, index) => {
  console.log(`  ${index + 1}. [${suggestion.type.toUpperCase()}] (confidence: ${suggestion.confidence})`);
  console.log(`     ${suggestion.content}`);
});

console.log('\n🎯 Off-Track Detection:');
console.log(`- Off-track: ${aiAnalysisResult.offTrack.isOffTrack ? 'Yes' : 'No'}`);
console.log(`- Severity: ${aiAnalysisResult.offTrack.severity}`);
console.log(`- Reason: ${aiAnalysisResult.offTrack.reason}`);

console.log('\n🌍 Scene Information:');
console.log(`- Type: ${aiAnalysisResult.sceneInfo.type}`);
console.log(`- Atmosphere: ${aiAnalysisResult.sceneInfo.atmosphere}`);
console.log(`- Potential Threats: ${aiAnalysisResult.sceneInfo.potentialThreats.join(', ')}`);

console.log('\n🎨 Mood Enhancements:');
aiAnalysisResult.moodEnhancements.forEach((enhancement, index) => {
  console.log(`  • ${enhancement}`);
});

console.log('\n✨ VoxChronicle RAG System Demo Complete ✨');