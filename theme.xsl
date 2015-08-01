<!-- Based on http://stackoverflow.com/a/15196470/1055499 -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="yes"/>
  <xsl:variable name="settings" select="document('FreshCut.tmTheme')/plist/dict/array/dict" />

  <xsl:template match="@* | node()">
    <xsl:copy>
      <xsl:apply-templates select="@* | node()"/>
    </xsl:copy>
  </xsl:template>

  <xsl:template match="plist/dict/array">
    <xsl:copy>
      <xsl:apply-templates select="$settings" />
      <xsl:apply-templates select="@* | node()[not(self::entry)] | entry[not(id = $settings/id)]" />
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>
