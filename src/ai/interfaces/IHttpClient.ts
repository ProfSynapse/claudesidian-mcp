import { RequestUrlResponse } from 'obsidian';

/**
 * Interface for HTTP request options
 */
export interface HttpRequestOptions {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    contentType?: string;
    throw?: boolean;
}

/**
 * Interface for HTTP clients
 * Follows Single Responsibility Principle by focusing only on HTTP requests
 */
export interface IHttpClient {
    /**
     * Makes an HTTP request
     * @param options Request options
     * @returns The response
     */
    request(options: HttpRequestOptions): Promise<RequestUrlResponse>;
    
    /**
     * Makes a GET request
     * @param url URL to request
     * @param headers Optional headers
     * @returns The response
     */
    get(url: string, headers?: Record<string, string>): Promise<RequestUrlResponse>;
    
    /**
     * Makes a POST request
     * @param url URL to request
     * @param body Request body
     * @param headers Optional headers
     * @returns The response
     */
    post(url: string, body: any, headers?: Record<string, string>): Promise<RequestUrlResponse>;
}
