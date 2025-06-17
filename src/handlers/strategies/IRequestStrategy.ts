export interface IRequestStrategy<TRequest = any, TResponse = any> {
    canHandle(request: TRequest): boolean;
    handle(request: TRequest): Promise<TResponse>;
}

export interface IRequestStrategyContext {
    agentName?: string;
    mode?: string;
    requestType?: string;
}