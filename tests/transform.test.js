const fs = require('fs');
const path = require('path');
const SaxonJS = require('saxon-js');

describe('XSLT Transformation', () => {
  let sefPath;
  let sampleFeedPath;
  
  beforeAll(() => {
    // Path to compiled SEF file
    sefPath = path.join(__dirname, '..', 'podcast-transform.sef.json');
    
    // Path to sample feed
    sampleFeedPath = path.join(__dirname, 'sample-feed.xml');
  });
  
  async function transformWithSaxon(limit, transformedFeedUrl) {
    // Load sample XML and compiled SEF file
    const xmlContent = fs.readFileSync(sampleFeedPath, 'utf8');
    const sefContent = JSON.parse(fs.readFileSync(sefPath, 'utf8'));
    
    // Transform using Saxon-JS with XML string input (no file writes)
    const result = await SaxonJS.transform({
      stylesheetInternal: sefContent,
      sourceText: xmlContent,
      destination: 'serialized',
      stylesheetParams: {
        'Q{}limit': limit,
        'Q{}transformedFeedUrl': transformedFeedUrl
      }
    }, 'async');
    
    return result.principalResult;
  }

  test('should limit items to specified number', async () => {
    const result = await transformWithSaxon(2, 'http://localhost:3000/test');
    
    // Count items in result
    const itemMatches = result.match(/<item>/g);
    expect(itemMatches).toHaveLength(2);
    
    // Verify first two episodes are included
    expect(result).toContain('Episode 1: First Episode');
    expect(result).toContain('Episode 2: Second Episode');
    expect(result).not.toContain('Episode 3: Third Episode');
  });

  test('should update atom:link href with transformed URL', async () => {
    const transformedUrl = 'http://localhost:3000/transformed';
    const result = await transformWithSaxon(5, transformedUrl);
    
    // Verify atom:link href is updated
    expect(result).toContain(`href="${transformedUrl}"`);
    expect(result).not.toContain('https://feeds.example.com/original-feed.xml');
  });

  test('should preserve CDATA sections', async () => {
    const result = await transformWithSaxon(5, 'http://localhost:3000/test');
    
    // Verify CDATA content is preserved (Saxon-JS may escape it)
    expect(result).toContain('&lt;strong&gt;HTML content&lt;/strong&gt;');
  });

  test('should preserve all feed metadata', async () => {
    const result = await transformWithSaxon(3, 'http://localhost:3000/test');
    
    // Verify channel metadata is preserved
    expect(result).toContain('<title>Test Podcast</title>');
    expect(result).toContain('<description>A test podcast feed</description>');
    expect(result).toContain('<link>https://example.com/podcast</link>');
  });

  test('should handle limit larger than available items', async () => {
    const result = await transformWithSaxon(10, 'http://localhost:3000/test');
    
    // Should include all 5 items
    const itemMatches = result.match(/<item>/g);
    expect(itemMatches).toHaveLength(5);
  });

  test('should handle empty transformedFeedUrl parameter', async () => {
    const result = await transformWithSaxon(2, '');
    
    // Should preserve original href when transformedFeedUrl is empty
    expect(result).toContain('https://feeds.example.com/original-feed.xml');
  });
});