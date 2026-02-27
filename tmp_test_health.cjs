const http = require('http');

const options = {
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/health',
    method: 'GET',
    timeout: 5000
};

console.log('Starting health check test...');

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.on('timeout', () => {
    console.error('Request timed out!');
    req.destroy();
});

req.end();
