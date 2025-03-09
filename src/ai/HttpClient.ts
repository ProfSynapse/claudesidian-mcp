import { requestUrl, RequestUrlResponse } from 'obsidian';
import { HttpRequestOptions, IHttpClient } from './interfaces/IHttpClient';

/**
 * HTTP client for making API requests
 * Implements IHttpClient interface
 */
export class HttpClient implements IHttpClient {
    /**
     * Makes an HTTP request
     * @param options Request options
     * @returns The response
     */
    async request(options: HttpRequestOptions): Promise<RequestUrlResponse> {
        try {
            const requestOptions: any = {
                url: options.url,
                method: options.method || 'GET',
                headers: options.headers || {},
                throw: options.throw !== undefined ? options.throw : true
            };
            
            if (options.body) {
                requestOptions.body = options.body;
            }
            
            if (options.contentType) {
                requestOptions.headers['Content-Type'] = options.contentType;
            }
            
            return await requestUrl(requestOptions);
        } catch (error) {
            console.error(`HTTP request failed: ${options.url}`, error);
            throw error;
        }
    }
    
    /**
     * Makes a GET request
     * @param url URL to request
     * @param headers Optional headers
     * @returns The response
     */
    async get(url: string, headers?: Record<string, string>): Promise<RequestUrlResponse> {
        return this.request({
            url,
            method: 'GET',
            headers
        });
    }
    
    /**
     * Makes a POST request
     * @param url URL to request
     * @param body Request body
     * @param headers Optional headers
     * @returns The response
     */
    async post(url: string, body: any, headers?: Record<string, string>): Promise<RequestUrlResponse> {
        const contentType = typeof body === 'string' ? 'text/plain' : 'application/json';
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        
        return this.request({
            url,
            method: 'POST',
            headers: {
                'Content-Type': contentType,
                ...headers
            },
            body: bodyStr
        });
    }
}
