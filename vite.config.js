import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Vite plugin to save CSV data back to disk
const saveCsvPlugin = () => ({
  name: 'save-csv',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/api/save-csv' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
          // Writing to the public folder root basically
          const filePath = path.join(process.cwd(), 'paper_search_results.csv');
          fs.writeFile(filePath, body, (err) => {
            if (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            }
          });
        });
      } else if (req.url.startsWith('/api/upload-pdf') && req.method === 'POST') {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const filename = urlObj.searchParams.get('filename');
        if (!filename) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing filename' }));
          return;
        }
        const papersDir = path.join(process.cwd(), 'papers');
        if (!fs.existsSync(papersDir)) fs.mkdirSync(papersDir);
        
        const filePath = path.join(papersDir, filename);
        const writeStream = fs.createWriteStream(filePath);
        req.pipe(writeStream);
        
        req.on('end', () => {
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, path: `/Users/zezhongwang/Downloads/VIS-Method/papers/${filename}` }));
        });
        
        req.on('error', (err) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        });
      } else if (req.url === '/api/save-labels' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
          const filePath = path.join(process.cwd(), 'label_descriptions.json');
          fs.writeFile(filePath, body, (err) => {
            if (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            }
          });
        });
      } else if (req.url.startsWith('/vismethodliterature/papers/')) {
        // Serve PDFs from the papers directory
        const filename = decodeURIComponent(req.url.replace('/vismethodliterature/papers/', ''));
        const filePath = path.join(process.cwd(), 'papers', filename);
        console.log(`[PDF DEBUG] Serving: "${filename}" at "${filePath}"`);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Length', stats.size);
          res.setHeader('Accept-Ranges', 'bytes');
          fs.createReadStream(filePath).pipe(res);
        } else {
          console.error(`[PDF ERROR] File not found: "${filePath}"`);
          res.statusCode = 404;
          res.end('Not Found');
        }
      } else {
        next();
      }
    });
  }
});

export default defineConfig({
  plugins: [react(), saveCsvPlugin()],
  base: '/vismethodliterature/',
})
