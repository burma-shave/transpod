<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="xml" encoding="UTF-8" omit-xml-declaration="yes"/>
  
  <!-- Parameters passed from Node.js -->
  <xsl:param name="limit" select="10"/>
  <xsl:param name="transformedFeedUrl" select="''"/>
  
  <!-- Identity template - copy everything by default -->
  <xsl:template match="@* | node()">
    <xsl:copy>
      <xsl:apply-templates select="@* | node()"/>
    </xsl:copy>
  </xsl:template>
  
  <!-- Handle atom:link element - update href to transformed feed URL -->
  <xsl:template match="atom:link[@rel='self']">
    <xsl:copy>
      <xsl:apply-templates select="@*[name() != 'href']"/>
      <xsl:attribute name="href">
        <xsl:choose>
          <xsl:when test="$transformedFeedUrl != ''">
            <xsl:value-of select="$transformedFeedUrl"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="@href"/>
          </xsl:otherwise>
        </xsl:choose>
      </xsl:attribute>
    </xsl:copy>
  </xsl:template>
  
  <!-- Limit the number of items using count -->
  <xsl:template match="channel">
    <xsl:copy>
      <xsl:apply-templates select="@*"/>
      <xsl:apply-templates select="node()[not(self::item)]"/>
      <xsl:apply-templates select="item[position() &lt;= number($limit)]"/>
    </xsl:copy>
  </xsl:template>
  
</xsl:stylesheet>