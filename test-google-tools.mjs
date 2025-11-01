#!/usr/bin/env node

/**
 * Standalone test to verify Google Gemini function calling
 * This mimics our actual structure to isolate the tool calling issue
 */

import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';

// Load .env file manually
const envContent = readFileSync('.env', 'utf-8');
const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.+)/);
const GEMINI_API_KEY = apiKeyMatch ? apiKeyMatch[1].trim() : null;

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in .env file');
  process.exit(1);
}

console.log('✅ API Key loaded');

// Initialize Google AI client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Test with a simple, non-file-system function first
const tools = [
  {
    functionDeclarations: [
      {
        name: 'get_current_weather',
        description: 'Get the current weather for a specified location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
              description: 'The temperature unit to use'
            }
          },
          required: ['location']
        }
      }
    ]
  }
];

const systemInstruction = {
  parts: [{
    text: `You are a helpful AI assistant with access to weather data through specialized tools.

When users ask about weather, use the get_current_weather tool to fetch real-time data.`
  }]
};

async function testToolCalling() {
  console.log('\n🧪 Starting Google Gemini Function Calling Test\n');

  const testCases = [
    {
      name: 'Weather request',
      message: 'What is the weather in San Francisco?'
    }
  ];

  // Run only first test case for now
  const testCase = testCases[0];
  console.log(`\n📝 Test: ${testCase.name}`);
  console.log(`💬 User: "${testCase.message}"\n`);

    try {
      const request = {
        model: 'gemini-2.0-flash-exp',
        contents: testCase.message,  // Simple string format
        config: {
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 4096,
            topK: 40,
            topP: 0.95
          },
          systemInstruction,
          tools,
          toolConfig: {
            functionCallingConfig: {
              mode: 'AUTO'
            }
          }
        }
      };

      console.log('📤 Sending request to Gemini...');
      console.log('   Model: gemini-2.0-flash-exp');
      console.log('   Temperature: 0');
      console.log('   Tools: 1 function declaration (get_current_weather)');
      console.log('   Mode: AUTO\n');

      const response = await ai.models.generateContent(request);

      // Debug: Log full response structure
      console.log('📊 Full response object:');
      console.log(JSON.stringify(response, null, 2));

      // Check for function calls in multiple ways
      const functionCalls = response.functionCalls;
      const parts = response.candidates?.[0]?.content?.parts;
      const hasFunctionCall = parts?.some(p => p.functionCall);

      if (functionCalls && functionCalls.length > 0) {
        console.log('✅ SUCCESS! Gemini called functions (via response.functionCalls):');
        functionCalls.forEach(fc => {
          console.log(`   🔧 ${fc.name}`);
          console.log(`      Args: ${JSON.stringify(fc.args, null, 2)}`);
        });
      } else if (hasFunctionCall) {
        console.log('✅ SUCCESS! Gemini called functions (via parts):');
        parts.filter(p => p.functionCall).forEach(p => {
          console.log(`   🔧 ${p.functionCall.name}`);
          console.log(`      Args: ${JSON.stringify(p.functionCall.args, null, 2)}`);
        });
      } else {
        console.log('❌ NO FUNCTION CALLS');
        console.log('📄 Response text:', response.text || '(empty)');

        // Check finish reason
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason) {
          console.log(`   Finish reason: ${finishReason}`);
        }

        // Check parts for function calls
        if (parts && parts.length > 0) {
          console.log('📦 Response parts:', JSON.stringify(parts, null, 2));
        }
      }

    } catch (error) {
      console.error('💥 ERROR:', error.message);
      if (error.status) {
        console.error('   Status:', error.status);
      }
    }

  console.log('\n✨ Test complete!\n');
}

// Run the test
testToolCalling().catch(console.error);
