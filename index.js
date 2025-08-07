const express = require('express');
const https = require('https');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const SaxonJS = require('saxon-js');

const app = express();
const port = process.env.PORT || 3000;

// Load compiled XSLT stylesheet
const sefPath = path.join(__dirname, 'podcast-transform.sef.json');

app.get('/', (req, res) => {
  const { feed, limit } = req.query;
  
  if (!feed) {
    // Serve the front page form
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Podcast Feed Transformer</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 2rem auto;
            padding: 0 1rem;
            line-height: 1.6;
            color: #333;
        }
        .container {
            background: #f8f9fa;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            margin-bottom: 1.5rem;
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #555;
        }
        input[type="url"], input[type="number"] {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1rem;
            box-sizing: border-box;
        }
        input[type="url"]:focus, input[type="number"]:focus {
            outline: none;
            border-color: #3498db;
            box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
        }
        .submit-btn {
            background: #3498db;
            color: white;
            padding: 0.75rem 2rem;
            border: none;
            border-radius: 4px;
            font-size: 1rem;
            cursor: pointer;
            width: 100%;
        }
        .submit-btn:hover {
            background: #2980b9;
        }
        .help-text {
            font-size: 0.875rem;
            color: #666;
            margin-top: 0.5rem;
        }
        .result {
            margin-top: 2rem;
            padding: 1rem;
            background: #e8f4f8;
            border-radius: 4px;
            word-break: break-all;
        }
        .result-label {
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎙️ Podcast Feed Transformer</h1>
        <p>Transform any podcast feed to limit the number of episodes returned.</p>
        
        <form id="podcastForm">
            <div class="form-group">
                <label for="feedUrl">Podcast Feed URL:</label>
                <input 
                    type="url" 
                    id="feedUrl" 
                    name="feedUrl" 
                    required 
                    placeholder="https://example.com/podcast.xml"
                />
                <div class="help-text">Enter the RSS/XML feed URL of the podcast</div>
            </div>
            
            <div class="form-group">
                <label for="episodeLimit">Episode Limit:</label>
                <input 
                    type="number" 
                    id="episodeLimit" 
                    name="episodeLimit" 
                    min="1" 
                    max="100" 
                    value="10"
                />
                <div class="help-text">Number of episodes to include (default: 10)</div>
            </div>
            
            <button type="submit" class="submit-btn">Generate Transformed Feed URL</button>
        </form>
        
        <div id="result" class="result" style="display: none;">
            <div class="result-label">Your transformed feed URL:</div>
            <div id="resultUrl"></div>
        </div>
    </div>

    <script>
        document.getElementById('podcastForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const feedUrl = document.getElementById('feedUrl').value;
            const limit = document.getElementById('episodeLimit').value || '10';
            
            const currentUrl = window.location.origin + window.location.pathname;
            const transformedUrl = currentUrl + '?feed=' + encodeURIComponent(feedUrl) + '&limit=' + limit;
            
            document.getElementById('resultUrl').textContent = transformedUrl;
            document.getElementById('result').style.display = 'block';
        });
    </script>
</body>
</html>`;
    return res.send(html);
  }
  
  const n = limit ? parseInt(limit) : 10;
  
  if (isNaN(n) || n < 1) {
    return res.status(400).json({ error: 'Limit must be a positive number' });
  }

  // Build the transformed feed URL
  const transformedFeedUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  fetchPodcastFeed(feed)
    .then(async xmlData => {
      const transformedXml = await transformFeed(xmlData, n, transformedFeedUrl);
      res.set('Content-Type', 'application/xml');
      res.send(transformedXml);
    })
    .catch(error => {
      console.error('Error processing feed:', error.message);
      res.status(500).json({ error: 'Failed to process podcast feed' });
    });
});

function fetchPodcastFeed(feedUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(feedUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const request = client.get(feedUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
    });
    
    request.on('error', reject);
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function transformFeed(xmlData, limit, transformedFeedUrl) {
  try {
    // Load compiled SEF file
    const sefContent = JSON.parse(fs.readFileSync(sefPath, 'utf8'));
    
    // Transform using Saxon-JS with XML string input (no file writes)
    const result = await SaxonJS.transform({
      stylesheetInternal: sefContent,
      sourceText: xmlData.toString(),
      destination: 'serialized',
      stylesheetParams: {
        'Q{}limit': limit,
        'Q{}transformedFeedUrl': transformedFeedUrl || ''
      }
    }, 'async');
    
    return result.principalResult;
  } catch (error) {
    throw new Error(`XSLT transformation failed: ${error.message}`);
  }
}

// Export app for testing
module.exports = app;

// Only start server if this file is run directly
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Podcast feed transformer listening on port ${port}`);
    console.log(`Usage: http://localhost:${port}/?feed=<podcast_feed_url>&limit=<number_of_episodes>`);
  });
}