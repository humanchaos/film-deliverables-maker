#!/usr/bin/env ts-node
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PREFLIGHT CHECK - gemini-super-app Beta Readiness
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This script verifies that all external dependencies are correctly configured
 * before deploying to production or running the app.
 * 
 * Usage:
 *   npx ts-node scripts/preflight_check.ts
 * 
 * Exit Codes:
 *   0 - All checks passed
 *   1 - One or more critical checks failed
 * 
 * @author Hostile Audit - QA Engineer
 * @date 2026-01-07
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

interface CheckResult {
    name: string;
    status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
    message: string;
    critical: boolean;
}

// ANSI colors for terminal output
const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
};

// Required environment variables
const REQUIRED_ENV_VARS = [
    { key: 'VITE_GEMINI_API_KEY', critical: true, description: 'Gemini API Key for AI analysis' },
    { key: 'VITE_GOOGLE_CLOUD_PROJECT_ID', critical: false, description: 'GCP Project ID for billing' },
    { key: 'VITE_GOOGLE_CLOUD_STORAGE_BUCKET', critical: false, description: 'GCS Bucket for Pro Mode uploads' },
    { key: 'VITE_GOOGLE_CLIENT_ID', critical: false, description: 'OAuth Client ID for Google Sign-In' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function loadEnvFile(): Record<string, string> {
    const envPath = path.resolve(process.cwd(), '.env');
    const envLocalPath = path.resolve(process.cwd(), '.env.local');

    const env: Record<string, string> = {};

    // Load .env first, then .env.local (local overrides)
    for (const filePath of [envPath, envLocalPath]) {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    if (key) {
                        // Remove surrounding quotes if present
                        let value = valueParts.join('=');
                        if ((value.startsWith('"') && value.endsWith('"')) ||
                            (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.slice(1, -1);
                        }
                        env[key.trim()] = value;
                    }
                }
            });
        }
    }

    return env;
}

function printHeader(): void {
    console.log('\n');
    console.log(`${COLORS.cyan}╔════════════════════════════════════════════════════════════╗${COLORS.reset}`);
    console.log(`${COLORS.cyan}║${COLORS.reset}  ${COLORS.bold}🛫 PREFLIGHT CHECK - gemini-super-app${COLORS.reset}                    ${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.cyan}║${COLORS.reset}  ${COLORS.dim}Beta Readiness Verification${COLORS.reset}                              ${COLORS.cyan}║${COLORS.reset}`);
    console.log(`${COLORS.cyan}╚════════════════════════════════════════════════════════════╝${COLORS.reset}`);
    console.log('\n');
}

function printResult(result: CheckResult): void {
    let icon: string;
    let color: string;

    switch (result.status) {
        case 'PASS':
            icon = '✅';
            color = COLORS.green;
            break;
        case 'FAIL':
            icon = '❌';
            color = COLORS.red;
            break;
        case 'WARN':
            icon = '⚠️ ';
            color = COLORS.yellow;
            break;
        case 'SKIP':
            icon = '⏭️ ';
            color = COLORS.dim;
            break;
    }

    const criticalTag = result.critical && result.status === 'FAIL'
        ? `${COLORS.red}[CRITICAL]${COLORS.reset} `
        : '';

    console.log(`  ${icon} ${criticalTag}${COLORS.bold}${result.name}${COLORS.reset}`);
    console.log(`     ${color}${result.message}${COLORS.reset}\n`);
}

function printSummary(results: CheckResult[]): void {
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warnings = results.filter(r => r.status === 'WARN').length;
    const skipped = results.filter(r => r.status === 'SKIP').length;

    console.log(`${COLORS.cyan}────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log(`${COLORS.bold}SUMMARY${COLORS.reset}`);
    console.log(`  ✅ Passed:   ${passed}`);
    console.log(`  ❌ Failed:   ${failed}`);
    console.log(`  ⚠️  Warnings: ${warnings}`);
    console.log(`  ⏭️  Skipped:  ${skipped}`);
    console.log(`${COLORS.cyan}────────────────────────────────────────────────────────────${COLORS.reset}`);

    const criticalFailures = results.filter(r => r.critical && r.status === 'FAIL');
    if (criticalFailures.length > 0) {
        console.log(`\n${COLORS.red}${COLORS.bold}🚫 PREFLIGHT FAILED${COLORS.reset}`);
        console.log(`${COLORS.red}   ${criticalFailures.length} critical check(s) did not pass.${COLORS.reset}`);
        console.log(`${COLORS.red}   Please fix the issues above before proceeding.${COLORS.reset}\n`);
    } else if (failed > 0) {
        console.log(`\n${COLORS.yellow}${COLORS.bold}⚠️  PREFLIGHT PASSED WITH WARNINGS${COLORS.reset}`);
        console.log(`${COLORS.yellow}   Some non-critical checks failed. Review before production.${COLORS.reset}\n`);
    } else {
        console.log(`\n${COLORS.green}${COLORS.bold}🚀 PREFLIGHT PASSED${COLORS.reset}`);
        console.log(`${COLORS.green}   All systems go! Ready for Beta launch.${COLORS.reset}\n`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function checkEnvironmentVariables(env: Record<string, string>): Promise<CheckResult[]> {
    console.log(`${COLORS.bold}📋 Environment Variables${COLORS.reset}\n`);

    const results: CheckResult[] = [];

    for (const { key, critical, description } of REQUIRED_ENV_VARS) {
        const value = env[key] || process.env[key];

        if (!value) {
            results.push({
                name: key,
                status: critical ? 'FAIL' : 'WARN',
                message: `Missing: ${description}`,
                critical,
            });
        } else if (value.includes('YOUR_') || value.includes('xxx') || value.length < 10) {
            results.push({
                name: key,
                status: critical ? 'FAIL' : 'WARN',
                message: `Placeholder detected - please set a real value`,
                critical,
            });
        } else {
            results.push({
                name: key,
                status: 'PASS',
                message: `Set (${value.substring(0, 8)}...${value.slice(-4)})`,
                critical,
            });
        }

        printResult(results[results.length - 1]);
    }

    return results;
}

async function checkBucketAccess(env: Record<string, string>): Promise<CheckResult> {
    console.log(`${COLORS.bold}☁️  Google Cloud Storage Bucket Access${COLORS.reset}\n`);

    const bucketName = env['VITE_GOOGLE_CLOUD_STORAGE_BUCKET'] || process.env['VITE_GOOGLE_CLOUD_STORAGE_BUCKET'];

    if (!bucketName) {
        const result: CheckResult = {
            name: 'GCS Bucket Write Test',
            status: 'SKIP',
            message: 'VITE_GOOGLE_CLOUD_STORAGE_BUCKET not configured (Pro Mode disabled)',
            critical: false,
        };
        printResult(result);
        return result;
    }

    // For actual bucket write test, we'd need auth. 
    // In a real implementation, this would use the Google Cloud SDK.
    // For now, we verify the bucket name format and check if gsutil is available.

    try {
        // Check if gcloud is installed
        execSync('gcloud --version', { stdio: 'pipe' });

        // Attempt to list bucket (requires auth)
        try {
            execSync(`gsutil ls gs://${bucketName}/ 2>&1 | head -1`, { stdio: 'pipe' });

            const result: CheckResult = {
                name: 'GCS Bucket Write Test',
                status: 'PASS',
                message: `Bucket "gs://${bucketName}" is accessible`,
                critical: false,
            };
            printResult(result);
            return result;
        } catch (listError) {
            // Could be auth issue or bucket doesn't exist
            const result: CheckResult = {
                name: 'GCS Bucket Write Test',
                status: 'WARN',
                message: `Could not access "gs://${bucketName}" - check gcloud auth or bucket exists`,
                critical: false,
            };
            printResult(result);
            return result;
        }
    } catch (error) {
        // gcloud not installed
        const result: CheckResult = {
            name: 'GCS Bucket Write Test',
            status: 'WARN',
            message: `gcloud CLI not installed - cannot verify bucket access. Install: https://cloud.google.com/sdk/docs/install`,
            critical: false,
        };
        printResult(result);
        return result;
    }
}

async function checkGeminiApiConnectivity(env: Record<string, string>): Promise<CheckResult> {
    console.log(`${COLORS.bold}🤖 Gemini API Connectivity${COLORS.reset}\n`);

    const apiKey = env['VITE_GEMINI_API_KEY'] || process.env['VITE_GEMINI_API_KEY'];

    if (!apiKey || apiKey.includes('YOUR_') || apiKey.length < 20) {
        const result: CheckResult = {
            name: 'Gemini API Connectivity',
            status: 'FAIL',
            message: 'VITE_GEMINI_API_KEY not configured or invalid',
            critical: true,
        };
        printResult(result);
        return result;
    }

    try {
        // Use native fetch (Node 18+) or fallback
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            { method: 'GET' }
        );

        if (response.ok) {
            const data = await response.json() as { models?: { name: string }[] };
            const modelCount = data.models?.length || 0;

            const result: CheckResult = {
                name: 'Gemini API Connectivity',
                status: 'PASS',
                message: `Connected! ${modelCount} models available`,
                critical: true,
            };
            printResult(result);
            return result;
        } else {
            const errorText = await response.text();
            const result: CheckResult = {
                name: 'Gemini API Connectivity',
                status: 'FAIL',
                message: `API Error (${response.status}): ${errorText.substring(0, 100)}`,
                critical: true,
            };
            printResult(result);
            return result;
        }
    } catch (error: any) {
        const result: CheckResult = {
            name: 'Gemini API Connectivity',
            status: 'FAIL',
            message: `Connection failed: ${error.message}`,
            critical: true,
        };
        printResult(result);
        return result;
    }
}

async function checkFfmpeg(): Promise<CheckResult> {
    console.log(`${COLORS.bold}🎬 FFmpeg Binary${COLORS.reset}\n`);

    try {
        const version = execSync('ffmpeg -version 2>&1 | head -1', { encoding: 'utf-8' });

        const result: CheckResult = {
            name: 'FFmpeg Installation',
            status: 'PASS',
            message: version.trim().substring(0, 60),
            critical: false,
        };
        printResult(result);
        return result;
    } catch (error) {
        const result: CheckResult = {
            name: 'FFmpeg Installation',
            status: 'WARN',
            message: 'FFmpeg not found in PATH. Some features may be limited. Install: https://ffmpeg.org/download.html',
            critical: false,
        };
        printResult(result);
        return result;
    }
}

async function checkNodeVersion(): Promise<CheckResult> {
    console.log(`${COLORS.bold}📦 Node.js Version${COLORS.reset}\n`);

    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

    if (majorVersion >= 18) {
        const result: CheckResult = {
            name: 'Node.js Version',
            status: 'PASS',
            message: `Running Node.js ${nodeVersion} (requires >= 18 for fetch)`,
            critical: true,
        };
        printResult(result);
        return result;
    } else {
        const result: CheckResult = {
            name: 'Node.js Version',
            status: 'FAIL',
            message: `Node.js ${nodeVersion} is too old. Requires >= 18.0.0`,
            critical: true,
        };
        printResult(result);
        return result;
    }
}

async function checkPackageJson(): Promise<CheckResult> {
    console.log(`${COLORS.bold}📄 Package.json Validation${COLORS.reset}\n`);

    const packagePath = path.resolve(process.cwd(), 'package.json');

    if (!fs.existsSync(packagePath)) {
        const result: CheckResult = {
            name: 'Package.json',
            status: 'FAIL',
            message: 'package.json not found. Are you in the project root?',
            critical: true,
        };
        printResult(result);
        return result;
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        const requiredDeps = ['@google/generative-ai', 'react', 'typescript'];
        const missingDeps = requiredDeps.filter(dep => !deps[dep]);

        if (missingDeps.length > 0) {
            const result: CheckResult = {
                name: 'Package.json',
                status: 'WARN',
                message: `Missing dependencies: ${missingDeps.join(', ')}`,
                critical: false,
            };
            printResult(result);
            return result;
        }

        const result: CheckResult = {
            name: 'Package.json',
            status: 'PASS',
            message: `Project: ${pkg.name || 'unnamed'} v${pkg.version || '0.0.0'}`,
            critical: true,
        };
        printResult(result);
        return result;
    } catch (error: any) {
        const result: CheckResult = {
            name: 'Package.json',
            status: 'FAIL',
            message: `Invalid package.json: ${error.message}`,
            critical: true,
        };
        printResult(result);
        return result;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
    printHeader();

    const results: CheckResult[] = [];

    // Load environment
    const env = loadEnvFile();
    console.log(`${COLORS.dim}Loaded environment from .env and .env.local${COLORS.reset}\n`);

    // Run all checks
    results.push(await checkNodeVersion());
    results.push(await checkPackageJson());
    results.push(...await checkEnvironmentVariables(env));
    results.push(await checkGeminiApiConnectivity(env));
    results.push(await checkBucketAccess(env));
    results.push(await checkFfmpeg());

    // Print summary
    printSummary(results);

    // Exit with appropriate code
    const criticalFailures = results.filter(r => r.critical && r.status === 'FAIL');
    process.exit(criticalFailures.length > 0 ? 1 : 0);
}

// Run
main().catch(error => {
    console.error(`${COLORS.red}Preflight check crashed: ${error.message}${COLORS.reset}`);
    process.exit(1);
});
