#!/usr/bin/env node

const http = require('http');
const https = require('https');
const url = require('url');

function usage() {
  console.log('Usage: node test.js <feed_url> [limit]');
  console.log('Example: node test.js "https://example.com/podcast.xml" 5');
  process.exit(1);
}

function fetchUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const request = client.get(targetUrl, (response) => {
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

async function testTranspod(feedUrl, limit = 10) {
  const baseUrl = 'http://localhost:3000';
  const encodedFeedUrl = encodeURIComponent(feedUrl);
  const testUrl = `${baseUrl}/?feed=${encodedFeedUrl}&limit=${limit}`;
  
  console.log(`Testing transpod service...`);
  console.log(`Feed URL: ${feedUrl}`);
  console.log(`Limit: ${limit}`);
  console.log(`Request URL: ${testUrl}`);
  console.log('---');
  
  try {
    const result = await fetchUrl(testUrl);
    
    // Count items in the result
    const itemMatches = result.match(/<item>/gi);
    const itemCount = itemMatches ? itemMatches.length : 0;
    
    console.log(`Response received (${result.length} characters)`);
    console.log(`Number of items in response: ${itemCount}`);
    console.log('---');
    console.log('Response:');
    console.log(result);
    
  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\nMake sure the transpod service is running:');
      console.log('  node index.js');
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  usage();
}

const feedUrl = args[0];
const limit = args[1] ? parseInt(args[1]) : 10;

if (!feedUrl) {
  usage();
}

testTranspod(feedUrl, limit);