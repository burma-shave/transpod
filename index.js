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
    return res.status(400).json({ error: 'Feed URL parameter is required' });
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