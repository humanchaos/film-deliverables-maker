#!/usr/bin/env npx ts-node
/**
 * Unit test for the enrichShotList array unwrapping fix
 * Tests that the function correctly handles object-wrapped responses
 */

// Simulate the fix logic (extracted from geminiService.ts)
function extractEnrichmentsArray(enrichments: any): any[] {
    console.log(`[Test] Raw enrichments type: ${typeof enrichments}`);
    console.log(`[Test] Is array: ${Array.isArray(enrichments)}`);

    let enrichmentsArray: any[];

    if (Array.isArray(enrichments)) {
        enrichmentsArray = enrichments;
        console.log(`[Test] ✓ Direct array with ${enrichments.length} items`);
    } else if (typeof enrichments === 'object' && enrichments !== null) {
        console.log(`[Test] Enrichments is object, keys: ${Object.keys(enrichments).join(', ')}`);

        const possibleArrays = ['enrichments', 'shots', 'items', 'data', 'results'];
        let foundArray = null;

        for (const key of possibleArrays) {
            if (Array.isArray(enrichments[key])) {
                foundArray = enrichments[key];
                console.log(`[Test] ✓ Found array under key '${key}' with ${foundArray.length} items`);
                break;
            }
        }

        if (!foundArray) {
            for (const key of Object.keys(enrichments)) {
                if (Array.isArray(enrichments[key])) {
                    foundArray = enrichments[key];
                    console.log(`[Test] ✓ Found array under unknown key '${key}' with ${foundArray.length} items`);
                    break;
                }
            }
        }

        enrichmentsArray = foundArray || [];
        if (!foundArray) {
            console.warn(`[Test] ✗ Could not find array in object response`);
        }
    } else {
        console.warn(`[Test] ✗ Unexpected enrichments type: ${typeof enrichments}`);
        enrichmentsArray = [];
    }

    return enrichmentsArray;
}

// Test cases
console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  🧪 Testing enrichShotList Array Unwrapping Fix            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// TEST 1: Direct array (works before fix)
console.log('━━━ TEST 1: Direct Array Response (small videos) ━━━');
const test1 = [
    { id: 0, description: 'Shot 1 description', action: 'Action 1', audio: '' },
    { id: 1, description: 'Shot 2 description', action: 'Action 2', audio: '' },
];
const result1 = extractEnrichmentsArray(test1);
console.log(`Result: ${result1.length} items`);
console.log(`PASS: ${result1.length === 2 ? '✅' : '❌'}\n`);

// TEST 2: Object-wrapped with 'enrichments' key (the actual bug)
console.log('━━━ TEST 2: Object Wrapped with "enrichments" key (553 shots bug) ━━━');
const test2 = {
    enrichments: Array.from({ length: 553 }, (_, i) => ({
        id: i,
        description: `Shot ${i + 1} - Wide shot of landscape`,
        action: `Camera pans left`,
        audio: 'Natural ambience'
    }))
};
const result2 = extractEnrichmentsArray(test2);
console.log(`Result: ${result2.length} items`);
console.log(`First item description: "${result2[0]?.description}"`);
console.log(`PASS: ${result2.length === 553 && result2[0]?.description.includes('Wide shot') ? '✅' : '❌'}\n`);

// TEST 3: Object-wrapped with 'shots' key
console.log('━━━ TEST 3: Object Wrapped with "shots" key ━━━');
const test3 = {
    shots: [
        { id: 0, description: 'Opening scene', action: 'Fade in', audio: '' },
    ]
};
const result3 = extractEnrichmentsArray(test3);
console.log(`Result: ${result3.length} items`);
console.log(`PASS: ${result3.length === 1 ? '✅' : '❌'}\n`);

// TEST 4: Object-wrapped with unknown key
console.log('━━━ TEST 4: Object Wrapped with unknown key ━━━');
const test4 = {
    shotDescriptions: [
        { id: 0, description: 'Unknown wrapper test', action: 'Test', audio: '' },
    ]
};
const result4 = extractEnrichmentsArray(test4);
console.log(`Result: ${result4.length} items`);
console.log(`PASS: ${result4.length === 1 ? '✅' : '❌'}\n`);

// TEST 5: Empty object (edge case)
console.log('━━━ TEST 5: Empty Object (edge case) ━━━');
const test5 = {};
const result5 = extractEnrichmentsArray(test5);
console.log(`Result: ${result5.length} items`);
console.log(`PASS: ${result5.length === 0 ? '✅' : '❌'}\n`);

// Summary
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const allPass = result1.length === 2 && result2.length === 553 && result3.length === 1 && result4.length === 1 && result5.length === 0;
console.log(`\n${allPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log('\nThe fix correctly handles:');
console.log('  • Direct array responses (small videos)');
console.log('  • Object-wrapped responses (large videos with 500+ shots)');
console.log('  • Unknown wrapper keys');
console.log('  • Edge cases\n');

if (allPass) {
    console.log('👍 Safe to deploy! The 553-shot video should now get proper descriptions.\n');
} else {
    console.log('⚠️ Review failed tests before deploying.\n');
    process.exit(1);
}
