
import http from 'http';
import url from 'url';
import handler from './api/instant-play.js';

const port = 3000;

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // Validar path
    if (parsedUrl.pathname !== '/api/instant-play') {
        res.statusCode = 404;
        res.end('Not Found');
        return;
    }

    // Mock Express-like properties
    req.query = parsedUrl.query;

    // Mock Response methods
    res.status = function (code) {
        this.statusCode = code;
        return this;
    };

    res.json = function (data) {
        this.setHeader('Content-Type', 'application/json');
        this.end(JSON.stringify(data, null, 2));
        return this;
    };

    try {
        await handler(req, res);
    } catch (e) {
        console.error("Handler error:", e);
        if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
        }
    }
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
