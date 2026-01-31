# LINDAS Version Analysis - SPARQL Queries

All queries target the LINDAS SPARQL endpoint: `https://ld.admin.ch/query`

## 1. Count Total Cubes and Observations

```sparql
PREFIX cube: <https://cube.link/>

SELECT
  (COUNT(DISTINCT ?cube) as ?totalCubes)
  (COUNT(?obs) as ?totalObs)
WHERE {
  ?cube a cube:Cube .
  ?cube cube:observationSet ?obsSet .
  ?obsSet cube:observation ?obs .
}
```

## 2. Count Total Triples on Observations

```sparql
PREFIX cube: <https://cube.link/>

SELECT (COUNT(*) as ?tripleCount) WHERE {
  ?obs a cube:Observation .
  ?obs ?p ?o .
}
```

## 3. Find Cube Families Grouped by Base Path (Version Count)

```sparql
PREFIX cube: <https://cube.link/>

SELECT ?baseCube (COUNT(?cube) as ?versionCount) WHERE {
  ?cube a cube:Cube .
  BIND(REPLACE(STR(?cube), "/[0-9]+$", "") AS ?baseCube)
}
GROUP BY ?baseCube
ORDER BY DESC(?versionCount)
LIMIT 30
```

## 4. Count Unique Cube Families vs Total Versions

```sparql
PREFIX cube: <https://cube.link/>

SELECT
  (COUNT(DISTINCT ?baseCube) as ?uniqueCubeFamilies)
  (COUNT(?cube) as ?totalCubeVersions)
WHERE {
  ?cube a cube:Cube .
  BIND(REPLACE(STR(?cube), "/[0-9]+$", "") AS ?baseCube)
}
```

## 5. Find Versioned Cubes with Latest Version Numbers

```sparql
PREFIX cube: <https://cube.link/>

SELECT ?baseCube (MAX(?versionNum) as ?latestVersion) (COUNT(?cube) as ?versionCount) WHERE {
  ?cube a cube:Cube .
  BIND(REPLACE(STR(?cube), "/[0-9]+$", "") AS ?baseCube)
  BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)$", "$1")) AS ?versionNum)
  FILTER(REGEX(STR(?cube), "/[0-9]+$"))
}
GROUP BY ?baseCube
HAVING(COUNT(?cube) > 5)
ORDER BY DESC(?versionCount)
LIMIT 30
```

## 6. Get Observations Per Cube Version (for retention calculation)

```sparql
PREFIX cube: <https://cube.link/>

SELECT ?baseCube ?versionNum (COUNT(?obs) as ?obsCount) WHERE {
  ?cube a cube:Cube .
  ?cube cube:observationSet ?obsSet .
  ?obsSet cube:observation ?obs .
  BIND(REPLACE(STR(?cube), "/[0-9]+$", "") AS ?baseCube)
  BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)$", "$1")) AS ?versionNum)
  FILTER(REGEX(STR(?cube), "/[0-9]+$"))
}
GROUP BY ?baseCube ?versionNum
ORDER BY ?baseCube DESC(?versionNum)
```

## 7. Count Observations in Non-Versioned Cubes

```sparql
PREFIX cube: <https://cube.link/>

SELECT (COUNT(?obs) as ?obsCount) WHERE {
  ?cube a cube:Cube .
  ?cube cube:observationSet ?obsSet .
  ?obsSet cube:observation ?obs .
  FILTER(!REGEX(STR(?cube), "/[0-9]+$"))
}
```

## 8. List Top Cubes by Observation Count

```sparql
PREFIX cube: <https://cube.link/>

SELECT ?cube (COUNT(?obs) as ?obsCount) WHERE {
  ?cube a cube:Cube .
  ?cube cube:observationSet ?obsSet .
  ?obsSet cube:observation ?obs .
}
GROUP BY ?cube
ORDER BY DESC(?obsCount)
LIMIT 20
```

---

## Python Script for Retention Calculation

After running Query #6, process the results with this Python script:

```python
import json
from collections import defaultdict

# Load JSON results from Query #6
data = json.load(open('query6_results.json'))
cube_data = defaultdict(list)

for binding in data['results']['bindings']:
    base = binding['baseCube']['value']
    version = int(binding['versionNum']['value'])
    count = int(binding['obsCount']['value'])
    cube_data[base].append((version, count))

total_obs = 0
newest_2_obs = 0
newest_3_obs = 0

for base, versions in cube_data.items():
    versions.sort(key=lambda x: -x[0])  # Sort by version descending
    for i, (ver, count) in enumerate(versions):
        total_obs += count
        if i < 2:
            newest_2_obs += count
        if i < 3:
            newest_3_obs += count

print(f'Total cube families: {len(cube_data)}')
print(f'Total observations: {total_obs:,}')
print(f'Observations with newest 2 versions: {newest_2_obs:,} ({newest_2_obs*100/total_obs:.1f}%)')
print(f'Observations with newest 3 versions: {newest_3_obs:,} ({newest_3_obs*100/total_obs:.1f}%)')
```

---

## cURL Examples

### Run Query via cURL

```bash
curl -X POST "https://ld.admin.ch/query" \
  -H "Content-Type: application/sparql-query" \
  -H "Accept: application/sparql-results+json" \
  --data 'PREFIX cube: <https://cube.link/>
SELECT (COUNT(?obs) as ?totalObs) WHERE {
  ?cube a cube:Cube .
  ?cube cube:observationSet ?obsSet .
  ?obsSet cube:observation ?obs .
}'
```

### Save Results to File

```bash
curl -X POST "https://ld.admin.ch/query" \
  -H "Content-Type: application/sparql-query" \
  -H "Accept: application/sparql-results+json" \
  --data-binary @query.sparql \
  -o results.json
```