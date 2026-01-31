# LINDAS Cube Version Analysis

Analysis of data retention if only keeping newest N versions per cube family.

## Data Summary

| Metric | Value |
|--------|-------|
| Total cubes | 1,663 |
| Total observations | 11,990,123 |
| Total triples on observations | 151,253,865 |
| Average triples per observation | ~12.6 |

## Cube Structure

### Versioned Cubes (URI ends with /N)
- **182 cube families** with version numbers in their URIs
- Example: `https://health.ld.admin.ch/fsvo/BT/94` (version 94)
- Contains **9,236,981 observations** (77% of total)
- Top versioned cube families:
  - BT: 94 versions
  - BT_table: 74 versions
  - BT_entwicklung: 70 versions
  - Ueberwachung_Wildvoegel_Aviaere_Influenza: 58 versions
  - BT_map: 33 versions

### Non-Versioned Cubes
- Cubes without version numbers in URIs
- Contains **2,753,142 observations** (23% of total)
- These would always be kept regardless of version policy

## Retention Analysis

### Scenario: Keep Newest 2 Versions

| Category | Observations | Triples (est.) | Percentage |
|----------|-------------|----------------|------------|
| Versioned kept | 3,026,005 | ~38,127,663 | 32.8% |
| Non-versioned | 2,753,142 | ~34,689,589 | 100% |
| **Total kept** | **5,779,147** | **~72,817,252** | **48.2%** |
| **Removed** | **6,210,976** | **~78,436,613** | **51.8%** |

### Scenario: Keep Newest 3 Versions

| Category | Observations | Triples (est.) | Percentage |
|----------|-------------|----------------|------------|
| Versioned kept | 3,709,485 | ~46,739,511 | 40.2% |
| Non-versioned | 2,753,142 | ~34,689,589 | 100% |
| **Total kept** | **6,462,627** | **~81,429,100** | **53.9%** |
| **Removed** | **5,527,496** | **~69,824,765** | **46.1%** |

## Key Insights

1. **High version accumulation**: Some cube families have 70-94 versions, indicating frequent updates

2. **Significant space savings**: Keeping only newest 2 versions could reduce data by ~51.8%

3. **Observation density varies**: The ~12.6 triples per observation average suggests moderate dimension complexity

4. **Non-versioned cubes are minority**: Only 23% of observations are in non-versioned cubes

## Recommendations

- **For development/testing**: Keep newest 2 versions (saves ~52% space)
- **For production with history**: Keep newest 3 versions (saves ~46% space)
- Consider implementing automated version cleanup to prevent unbounded growth

## SPARQL Query Examples

### Find cube families with most versions
```sparql
PREFIX cube: <https://cube.link/>

SELECT ?baseCube (COUNT(?cube) as ?versionCount) WHERE {
  ?cube a cube:Cube .
  BIND(REPLACE(STR(?cube), "/[0-9]+$", "") AS ?baseCube)
} GROUP BY ?baseCube ORDER BY DESC(?versionCount) LIMIT 20
```

### Count observations per cube version
```sparql
PREFIX cube: <https://cube.link/>

SELECT ?cube (COUNT(?obs) as ?obsCount) WHERE {
  ?cube a cube:Cube .
  ?cube cube:observationSet ?obsSet .
  ?obsSet cube:observation ?obs .
} GROUP BY ?cube ORDER BY DESC(?obsCount) LIMIT 20
```

---
*Analysis date: 2026-01-23*
*Data source: https://ld.admin.ch/query*
