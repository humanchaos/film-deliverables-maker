
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("❌ ERROR: No API Key found.");
    console.error("Please run with: VITE_GEMINI_API_KEY=AI... node diagnostic-audit.js");
    process.exit(1);
}

console.log(`🔍 Starting Audit...`);
console.log(`🔑 Key detected (starts with): ${API_KEY.substring(0, 8)}...`);

const genAI = new GoogleGenerativeAI(API_KEY);

async function testModel(modelName) {
    console.log(`\n🧪 Testing connection to model: ${modelName}`);
    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hello! Are you responding?");
        const response = await result.response;
        console.log(`✅ SUCCESS! Model ${modelName} responded:`);
        console.log(`   "${response.text().substring(0, 50)}..."`);
        return true;
    } catch (error) {
        console.error(`❌ FAILED for ${modelName}`);
        console.error(`   Error Message: ${error.message}`);

        if (error.message.includes('404')) {
            console.error(`   👉 CONCLUSION: The API Key is VALID, but the Project DOES NOT have access to '${modelName}' or the API is disabled.`);
        } else if (error.message.includes('403')) {
            console.error(`   👉 CONCLUSION: The API Key is restricted or lacks permissions.`);
        }
        return false;
    }
}

async function runAudit() {
    console.log("------------------------------------------");

    // Test 1: Flash (Primary Target)
    const flashWorks = await testModel("gemini-1.5-flash");

    // Test 2: Pro (Comparison)
    // await testModel("gemini-1.5-pro");

    // Test 3: Generic Pro (Legacy)
    const legacyIncase = await testModel("gemini-pro");

    console.log("\n------------------------------------------");
    if (flashWorks) {
        console.log("🎉 AUDIT PASSED: gemini-1.5-flash is AVAILABLE.");
        console.log("   If the App still fails, the issue is strictly in the App/Deployment config (e.g. Vercel Env Vars).");
    } else if (legacyIncase) {
        console.log("⚠️  AUDIT PARTIAL: Flash failed, but 'gemini-pro' worked.");
        console.log("   Recommendation: Switch app to 'gemini-pro' immediately.");
    } else {
        console.log("⛔ AUDIT FAILED: No models worked.");
        console.log("   Action Required: Check Google Cloud Console > APIs & Services > Enabled APIs.");
        console.log("   Ensure 'Generative Language API' is enabled for this project.");
    }
    console.log("------------------------------------------");
}

runAudit();
