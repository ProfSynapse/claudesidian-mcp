/**
 * Debug Tool Call Tracing Issue
 * 
 * Run this in browser console to diagnose why tool calls aren't being saved to memory traces
 * 
 * Usage: Copy and paste into browser dev console while plugin is running
 */

(async function debugToolCallTracing() {
    console.log('🔍 Starting Tool Call Tracing Diagnosis...\n');
    
    // Get plugin instance
    const plugin = app.plugins.plugins['claudesidian-mcp'];
    if (!plugin) {
        console.error('❌ Claudesidian plugin not found');
        return;
    }
    console.log('✅ Plugin found:', plugin);
    
    // Check connector
    const connector = plugin.getConnector?.();
    if (!connector) {
        console.error('❌ Connector not found');
        return;
    }
    console.log('✅ Connector found:', connector);
    
    // Check tool call capture service in multiple locations
    let captureService = plugin.toolCallCaptureService;
    if (!captureService) {
        // Try from services registry
        captureService = plugin.services?.toolCallCaptureService;
    }
    if (!captureService) {
        // Try from service manager
        const serviceManager = plugin.getServiceManager?.();
        if (serviceManager) {
            captureService = serviceManager.getServiceIfReady?.('toolCallCaptureService');
        }
    }
    
    if (!captureService) {
        console.error('❌ ToolCallCaptureService not found anywhere');
        console.log('Available services:', Object.keys(plugin.services || {}));
        
        // Check service manager status
        const serviceManager = plugin.getServiceManager?.();
        if (serviceManager) {
            console.log('🔧 Service Manager found - checking service status...');
            // Try to get the service with more details
            try {
                const asyncService = await plugin.getService?.('toolCallCaptureService', 5000);
                if (asyncService) {
                    console.log('✅ Found ToolCallCaptureService via async getService:', asyncService);
                    captureService = asyncService;
                } else {
                    console.log('❌ ToolCallCaptureService not found via async getService either');
                }
            } catch (error) {
                console.log('❌ Error getting service:', error);
            }
        } else {
            console.log('❌ No service manager found');
        }
        
        if (!captureService) {
            console.log('🔍 Let me check the connector instead...');
            const connectorService = connector.toolCallCaptureService;
            if (connectorService) {
                console.log('✅ Found ToolCallCaptureService in connector:', connectorService);
                captureService = connectorService;
            }
        }
        
        if (!captureService) {
            return;
        }
    }
    console.log('✅ ToolCallCaptureService found:', captureService);
    
    // Check if service is fully functional (upgraded)
    const isUpgraded = captureService.isFullyFunctional();
    console.log(`🔧 Service upgrade status: ${isUpgraded ? 'UPGRADED' : 'NOT UPGRADED'}`);
    
    // Get capture statistics
    const stats = captureService.getCaptureStats();
    console.log('📊 Capture Statistics:');
    console.log('  - Total calls:', stats.totalCalls);
    console.log('  - Successful captures:', stats.successfulCaptures);
    console.log('  - Failed captures:', stats.failedCaptures);
    console.log('  - Queue size:', stats.queueSize);
    console.log('  - Average time:', stats.averageTime.toFixed(2) + 'ms');
    
    // Check memory trace service
    const memoryTraceService = plugin.memoryTraceService;
    if (!memoryTraceService) {
        console.warn('⚠️ MemoryTraceService not found on plugin');
    } else {
        console.log('✅ MemoryTraceService found:', memoryTraceService);
    }
    
    // Check simple memory service
    const simpleMemoryService = plugin.services?.simpleMemoryService;
    if (!simpleMemoryService) {
        console.warn('⚠️ SimpleMemoryService not found');
    } else {
        console.log('✅ SimpleMemoryService found:', simpleMemoryService);
        
        // Get storage status if available
        if (simpleMemoryService.getStorageStatus) {
            simpleMemoryService.getStorageStatus().then(status => {
                console.log('💾 SimpleMemoryService Storage Status:');
                console.log('  - In memory count:', status.inMemoryCount);
                console.log('  - Vector store available:', status.vectorStoreAvailable);
                console.log('  - Storage coordinator available:', status.storageCoordinatorAvailable);
                console.log('  - Pending count:', status.pendingCount);
                console.log('  - Collection healthy:', status.collectionHealthy);
            }).catch(err => console.error('Failed to get storage status:', err));
        }
        
        // Get stats
        if (simpleMemoryService.getStats) {
            const simpleStats = simpleMemoryService.getStats();
            console.log('📊 SimpleMemoryService Stats:');
            console.log('  - Tool calls:', simpleStats.toolCalls);
            console.log('  - Sessions:', simpleStats.sessions);
            console.log('  - Traces:', simpleStats.traces);
            console.log('  - Metadata:', simpleStats.metadata);
        }
    }
    
    // Check vector store
    const vectorStore = plugin.vectorStore;
    if (!vectorStore) {
        console.warn('⚠️ Vector store not found');
    } else {
        console.log('✅ Vector store found:', vectorStore);
    }
    
    // Test tool call capture
    console.log('\n🧪 Testing tool call capture...');
    
    // Create a test tool call
    const testRequest = {
        toolCallId: 'debug-test-' + Date.now(),
        agent: 'test',
        mode: 'debug',
        params: { test: true },
        timestamp: Date.now(),
        source: 'debug-test'
    };
    
    captureService.captureRequest(testRequest).then(context => {
        console.log('✅ Test request captured:', context);
        
        // Capture test response
        const testResponse = {
            result: { debugTest: 'success' },
            success: true,
            executionTime: 100,
            timestamp: Date.now()
        };
        
        return captureService.captureResponse(testRequest.toolCallId, testResponse);
    }).then(() => {
        console.log('✅ Test response captured');
        
        // Wait a moment then check stats again
        setTimeout(() => {
            const newStats = captureService.getCaptureStats();
            console.log('📊 Updated Capture Statistics:');
            console.log('  - Total calls:', newStats.totalCalls);
            console.log('  - Successful captures:', newStats.successfulCaptures);
            console.log('  - Failed captures:', newStats.failedCaptures);
            console.log('  - Queue size:', newStats.queueSize);
        }, 2000);
        
    }).catch(err => {
        console.error('❌ Test capture failed:', err);
    });
    
    console.log('\n📝 Diagnosis complete. Check logs above for issues.');
    console.log('🎯 Key things to look for:');
    console.log('  1. Is service upgraded? Should be true');
    console.log('  2. Are there successful captures? Should increase over time');
    console.log('  3. Is vector store available? Should be true');
    console.log('  4. Are traces being stored? Check SimpleMemoryService stats');
})();