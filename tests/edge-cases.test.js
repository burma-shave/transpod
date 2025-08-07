const fs = require('fs');
const path = require('path');
const SaxonJS = require('saxon-js');

describe('Edge Cases and Error Handling', () => {
  let sefPath;
  
  beforeAll(() => {
    sefPath = path.join(__dirname, '..', 'podcast-transform.sef.json');
  });

  async function transformXmlWithSaxon(xmlContent, limit, transformedFeedUrl) {
    // Write XML to temp file for SaxonJS.getResource
    const tempPath = path.join(__dirname, 'temp-test.xml');
    fs.writeFileSync(tempPath, xmlContent);
    
    try {
      const xmlDoc = await SaxonJS.getResource({
        location: tempPath,
        type: 'xml'
      });
      
      const result = await SaxonJS.transform({
        stylesheetFileName: sefPath,
        sourceNode: xmlDoc,
        destination: 'serialized',
        stylesheetParams: {
          'Q{}limit': limit,
          'Q{}transformedFeedUrl': transformedFeedUrl
        }
      }, 'async');
      
      return result.principalResult;
    } finally {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  test('should handle malformed XML', async () => {
    const malformedXml = '<?xml version="1.0"?><rss><channel><title>Test</title><item><title>Unclosed item</channel></rss>';
    
    await expect(transformXmlWithSaxon(malformedXml, 5, 'http://localhost:3000/test'))
      .rejects.toThrow();
  });

  test('should handle XML without items', async () => {
    const noItemsXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Empty Podcast</title>
    <description>A podcast with no episodes</description>
    <atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>
  </channel>
</rss>`;

    const result = await transformXmlWithSaxon(noItemsXml, 5, 'http://localhost:3000/test');
    
    // Should still have channel metadata but no items
    expect(result).toContain('<title>Empty Podcast</title>');
    expect(result).not.toContain('<item>');
  });

  test('should handle limit of 0', async () => {
    const sampleFeed = fs.readFileSync(path.join(__dirname, 'sample-feed.xml'), 'utf8');
    
    const result = await transformXmlWithSaxon(sampleFeed, 0, 'http://localhost:3000/test');
    
    // Should include no items when limit is 0
    expect(result).not.toContain('<item>');
    expect(result).toContain('<title>Test Podcast</title>');
  });

  test('should handle very large limit values', async () => {
    const sampleFeed = fs.readFileSync(path.join(__dirname, 'sample-feed.xml'), 'utf8');
    
    const result = await transformXmlWithSaxon(sampleFeed, 999999, 'http://localhost:3000/test');
    
    // Should include all available items (5 in sample feed)
    const itemMatches = result.match(/<item>/g);
    expect(itemMatches).toHaveLength(5);
  });

  test('should handle special characters in feed content', async () => {
    const specialCharsFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Special Characters Podcast</title>
    <description>A podcast with special characters: &amp; &lt; &gt; " '</description>
    <atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>
    
    <item>
      <title>Episode with &amp; ampersand</title>
      <description>Content with &lt;em&gt;HTML&lt;/em&gt; and "quotes" and 'apostrophes'</description>
      <guid>special-ep1</guid>
    </item>
  </channel>
</rss>`;

    const result = await transformXmlWithSaxon(specialCharsFeed, 5, 'http://localhost:3000/test');
    
    // Should preserve escaped characters
    expect(result).toContain('Episode with &amp; ampersand');
    expect(result).toContain('&lt;em&gt;HTML&lt;/em&gt;');
  });

  test('should handle missing atom:link element', async () => {
    const noAtomLinkFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>No Atom Link Podcast</title>
    <description>A podcast without atom:link</description>
    
    <item>
      <title>Episode 1</title>
      <description>First episode</description>
      <guid>ep1</guid>
    </item>
  </channel>
</rss>`;

    const result = await transformXmlWithSaxon(noAtomLinkFeed, 5, 'http://localhost:3000/test');
    
    // Should still work without atom:link element
    expect(result).toContain('<title>No Atom Link Podcast</title>');
    expect(result).toContain('<title>Episode 1</title>');
  });

  test('should handle atom:link without rel=self', async () => {
    const differentAtomLinkFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Different Atom Link Podcast</title>
    <description>A podcast with different atom:link</description>
    <atom:link href="https://example.com/alternate" rel="alternate" type="application/rss+xml"/>
    
    <item>
      <title>Episode 1</title>
      <description>First episode</description>
      <guid>ep1</guid>
    </item>
  </channel>
</rss>`;

    const result = await transformXmlWithSaxon(differentAtomLinkFeed, 5, 'http://localhost:3000/test');
    
    // Should not modify atom:link that doesn't have rel="self"
    expect(result).toContain('href="https://example.com/alternate"');
    expect(result).toContain('rel="alternate"');
  });
});