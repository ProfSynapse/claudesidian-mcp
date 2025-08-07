/**
 * Type declarations for @google/genai module
 * This provides basic typing to resolve TypeScript compilation errors
 */

declare module '@google/genai' {
  export interface GenerativeModel {
    generateContent(prompt: string | any): Promise<any>;
    generateContentStream(prompt: string | any): AsyncIterable<any>;
  }

  export interface ModelsAPI {
    embedContent(options: any): Promise<any>;
    generateContent(request: any): Promise<any>;
    generateContentStream(request: any): AsyncIterable<any>;
  }

  export interface GoogleGenAI {
    getGenerativeModel(options: { model: string }): GenerativeModel;
    models: ModelsAPI;
  }

  export class GoogleGenAI {
    constructor(options: { apiKey: string });
    getGenerativeModel(options: { model: string }): GenerativeModel;
    models: ModelsAPI;
  }

  export const GoogleGenAI: {
    new (options: { apiKey: string }): GoogleGenAI;
  };

  // Export other commonly used types as any for now
  export const HarmCategory: any;
  export const HarmBlockThreshold: any;
  export const GenerativeModel: any;
}