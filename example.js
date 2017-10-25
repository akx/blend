const http = require('http');
const Blend = require('.');

const b = new Blend();
b.on('/', req => ({ json: { query: req.query, body: req.body } }));

const server = http.createServer(b.handle);
server.listen(8000);
console.log('Listening on :8000');
