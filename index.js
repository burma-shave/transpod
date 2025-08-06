const express = require('express');
const https = require('https');
const http = require('http');
const url = require('url');
const sax = require('sax');

const app = express();
const port = process.env.PORT || 3000;

function escapeXmlAttribute(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXmlText(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

app.get('/', (req, res) => {
  const { feed, limit } = req.query;
  
  if (!feed) {
    return res.status(400).json({ error: 'Feed URL parameter is required' });
  }
  
  const n = parseInt(limit) || 10;
  
  if (n < 1) {
    return res.status(400).json({ error: 'Limit must be a positive number' });
  }

  fetchPodcastFeed(feed)
    .then(async xmlData => {
      const transformedXml = await transformFeed(xmlData, n);
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

function transformFeed(xmlData, limit) {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(false, { lowercase: true });
    let result = '';
    let currentItem = '';
    let insideItem = false;
    let itemCount = 0;
    let skipCurrentItem = false;

    parser.on('opentag', (node) => {
      if (node.name === 'item') {
        insideItem = true;
        itemCount++;
        skipCurrentItem = itemCount > limit;
        
        if (!skipCurrentItem) {
          const attrs = Object.entries(node.attributes)
            .map(([key, value]) => ` ${key}="${value}"`)
            .join('');
          currentItem = `<${node.name}${attrs}>`;
        }
      } else if (insideItem && !skipCurrentItem) {
        const attrs = Object.entries(node.attributes)
          .map(([key, value]) => ` ${key}="${escapeXmlAttribute(value)}"`)
          .join('');
        currentItem += `<${node.name}${attrs}>`;
      } else if (!insideItem) {
        const attrs = Object.entries(node.attributes)
          .map(([key, value]) => ` ${key}="${escapeXmlAttribute(value)}"`)
          .join('');
        result += `<${node.name}${attrs}>`;
      }
    });

    parser.on('closetag', (name) => {
      if (name === 'item') {
        insideItem = false;
        if (!skipCurrentItem) {
          currentItem += `</${name}>`;
          result += currentItem;
        }
        currentItem = '';
        skipCurrentItem = false;
      } else if (insideItem && !skipCurrentItem) {
        currentItem += `</${name}>`;
      } else if (!insideItem) {
        result += `</${name}>`;
      }
    });

    parser.on('text', (text) => {
      if (insideItem && !skipCurrentItem) {
        currentItem += escapeXmlText(text);
      } else if (!insideItem) {
        result += escapeXmlText(text);
      }
    });

    parser.on('cdata', (cdata) => {
      if (insideItem && !skipCurrentItem) {
        currentItem += `<![CDATA[${cdata}]]>`;
      } else if (!insideItem) {
        result += `<![CDATA[${cdata}]]>`;
      }
    });

    parser.on('end', () => {
      // Clean up excessive whitespace
      const cleaned = result.replace(/>\s*\n\s*</g, '><').replace(/^\s*\n/gm, '');
      resolve(cleaned);
    });
    parser.on('error', reject);

    parser.write(xmlData);
    parser.end();
  });
}

app.listen(port, () => {
  console.log(`Podcast feed transformer listening on port ${port}`);
  console.log(`Usage: http://localhost:${port}/?feed=<podcast_feed_url>&limit=<number_of_episodes>`);
});