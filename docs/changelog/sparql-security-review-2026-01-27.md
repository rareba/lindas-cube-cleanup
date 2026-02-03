# SPARQL Query Security and Correctness Review

**Date:** 2026-01-27  
**Reviewer:** Code Review System  
**Scope:** All SPARQL queries in `queries/`, `queries/universal/`, and `cleanup-service/src/utils/sparql.js`

---

## Executive Summary

This review identified **1 Critical vulnerability**, **5 High-severity issues**, **11 Medium-severity issues**, and **8 Low-severity issues** across the SPARQL query codebase. The most critical issue is a **SPARQL Injection vulnerability** in the `sparql.js` utilities that allows arbitrary code execution through unsanitized user input.

### Severity Distribution
| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 5 |
| Medium | 11 |
| Low | 8 |

---

## 1. CRITICAL VULNERABILITIES

### CRIT-001: SPARQL Injection in sparql.js - Arbitrary Query Injection

**Location:** [`cleanup-service/src/utils/sparql.js`](cleanup-service/src/utils/sparql.js:16) (all query builder functions)

**Description:**
All query builder functions use direct string interpolation to embed `graphUri` and `cubeUri` parameters into SPARQL queries without any sanitization or validation. This allows attackers to inject arbitrary SPARQL code.

**Vulnerable Code Pattern:**
```javascript
function listCubeVersionsQuery(graphUri) {
    return `${PREFIXES}
SELECT DISTINCT ?baseCube ?cube ?version ?dateCreated ?title
WHERE {
  GRAPH <${graphUri}> {  // <-- Direct interpolation, no escaping
    ?cube a cube:Cube .
```

**Attack Scenario:**
An attacker could provide a malicious `graphUri` like:
```
https://lindas.admin.ch/sfoe/cube> { ?s ?p ?o } } DROP ALL { <dummy
```

This would result in a query like:
```sparql
GRAPH <https://lindas.admin.ch/sfoe/cube> { ?s ?p ?o } } DROP ALL { <dummy> {
```

**Impact:**
- Complete data loss (DROP ALL, DROP GRAPH, DELETE WHERE)
- Unauthorized data modification
- Potential server compromise through stacked queries

**Affected Functions:**
- `listCubeVersionsQuery()` - line 16
- `identifyDeletionsQuery()` - line 36
- `previewCubeQuery()` - line 74
- `exportCubeQuery()` - line 102
- `deleteObservationsQuery()` - line 138
- `deleteObservationLinksQuery()` - line 155
- `deleteCubeMetadataQuery()` - line 170
- `deleteAllOldVersionsQuery()` - line 254
- All orphan-related query functions

**Remediation:**
1. Use SPARQL prepared statements/parameterized queries if the triplestore supports them
2. Implement strict IRI validation using RFC 3987 regex before interpolation
3. Escape angle brackets and other special characters in user input
4. Use a whitelist of allowed graph URIs from configuration

```javascript
// Example fix with IRI validation
function validateIri(iri) {
    // RFC 3987 compliant IRI pattern (simplified)
    const iriPattern = /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>"{}|^`\\]*$/;
    if (!iriPattern.test(iri)) {
        throw new Error(`Invalid IRI: ${iri}`);
    }
    // Additional check: prevent injection attempts
    if (iri.includes('>') || iri.includes('<') || iri.includes('}') || iri.includes('{')) {
        throw new Error(`IRI contains forbidden characters: ${iri}`);
    }
    return iri;
}

function listCubeVersionsQuery(graphUri) {
    const safeGraphUri = validateIri(graphUri);
    return `${PREFIXES}
SELECT DISTINCT ?baseCube ?cube ?version ?dateCreated ?title
WHERE {
  GRAPH <${safeGraphUri}> {
    // ...
```

---

## 2. HIGH SEVERITY ISSUES

### HIGH-001: Query Files Use Hardcoded Graph URIs (Inflexible & Risky)

**Location:** All `.rq` files in `queries/` directory (not `queries/universal/`)

**Description:**
All query files in the main `queries/` directory hardcode the graph URI `<https://lindas.admin.ch/sfoe/cube>`. This creates several problems:

1. **Inflexibility:** Queries cannot be reused for other environments or graphs
2. **Accidental Production Execution:** A query copied from test to production might target the wrong graph
3. **Maintenance Burden:** Changing the graph requires editing multiple files

**Affected Files:**
- [`queries/01-list-all-cube-versions.rq`](queries/01-list-all-cube-versions.rq:18)
- [`queries/02-count-versions-per-cube.rq`](queries/02-count-versions-per-cube.rq:9)
- [`queries/03-identify-versions-to-delete.rq`](queries/03-identify-versions-to-delete.rq:15)
- [`queries/04-preview-triples-to-delete.rq`](queries/04-preview-triples-to-delete.rq:46)
- [`queries/05-preview-single-cube-triples.rq`](queries/05-preview-single-cube-triples.rq:11)
- [`queries/06-delete-single-cube.rq`](queries/06-delete-single-cube.rq:9)
- [`queries/07-delete-observations-chunked.rq`](queries/07-delete-observations-chunked.rq:9)
- [`queries/08-delete-observation-links.rq`](queries/08-delete-observation-links.rq:7)
- [`queries/09-delete-cube-metadata.rq`](queries/09-delete-cube-metadata.rq:10)
- [`queries/10-count-observations-per-cube.rq`](queries/10-count-observations-per-cube.rq:8)

**Remediation:**
- Use the `queries/universal/` versions as templates with placeholders
- Create a preprocessing step that substitutes graph URIs before execution
- Add validation that the target graph matches expected patterns

### HIGH-002: Mismatched Regex Patterns Between Query Files and sparql.js

**Location:** Multiple files

**Description:**
The regex patterns for version extraction differ between `.rq` files and `sparql.js`, potentially causing inconsistent behavior:

**In `.rq` files (01, 02, 03, 04):**
```sparql
BIND(REPLACE(STR(?cube), "^.*/([^/]+)/([0-9]+)$", "$2") AS ?versionStr)
```
Captures: `cubename/version` - captures cubename as group 1, version as group 2

**In `sparql.js` (lines 43, 53, 58):**
```javascript
BIND(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1") AS ?versionStr)
```
Captures: just the version at the end

**Impact:**
- Inconsistent version parsing between manual queries and automated cleanup
- Cubes with version `0` may be handled differently
- Edge cases with trailing slashes produce different results

**Remediation:**
Standardize on a single regex pattern across all queries. Recommend:
```sparql
BIND(xsd:integer(REPLACE(STR(?cube), "^.*/([0-9]+)/?$", "$1")) AS ?version)
```

### HIGH-003: Missing DISTINCT in GROUP_CONCAT May Cause Duplicate Version Lists

**Location:** [`queries/02-count-versions-per-cube.rq`](queries/02-count-versions-per-cube.rq:7)

**Description:**
```sparql
SELECT ?baseCube (COUNT(DISTINCT ?cube) AS ?versionCount) (GROUP_CONCAT(DISTINCT ?version; separator=", ") AS ?versions)
```

While `DISTINCT` is used inside `GROUP_CONCAT`, the query lacks `DISTINCT` in the `SELECT` clause for `?baseCube`. If multiple cubes share the same base (which shouldn't happen but could due to data quality issues), this could produce duplicate rows.

**Remediation:**
```sparql
SELECT DISTINCT ?baseCube (COUNT(DISTINCT ?cube) AS ?versionCount) ...
```

### HIGH-004: Delete Query Triple Patterns May Miss Nested Blank Nodes Beyond Level 2

**Location:** [`queries/06-delete-single-cube.rq`](queries/06-delete-single-cube.rq:16), [`queries/09-delete-cube-metadata.rq`](queries/09-delete-cube-metadata.rq:16), [`cleanup-service/src/utils/sparql.js`](cleanup-service/src/utils/sparql.js:172)

**Description:**
The delete queries only traverse blank nodes to level 2:
```sparql
?cube ?p1 ?metaLevel1 .
OPTIONAL {
  ?metaLevel1 ?p2 ?metaLevel2
  FILTER(isBlank(?metaLevel1))
}
```

If a cube has deeply nested blank nodes (e.g., lists of lists, complex shapes), triples beyond level 2 will not be deleted, leaving orphaned data.

**Impact:**
- Incomplete cube deletion
- Orphaned triples accumulating in the graph
- Violation of referential integrity

**Remediation:**
Use property path `(<>|!<>)*` for recursive blank node traversal:
```sparql
?cube ?p1 ?metaLevel1 .
OPTIONAL {
  ?metaLevel1 (<>|!<>)* ?deepNode .
  ?deepNode ?p2 ?o2 .
}
```

### HIGH-005: LIMIT in DELETE WHERE May Not Be Supported by All Triplestores

**Location:** [`queries/07-delete-observations-chunked.rq`](queries/07-delete-observations-chunked.rq:20), [`queries/08-delete-observation-links.rq`](queries/08-delete-observation-links.rq:17)

**Description:**
```sparql
DELETE {
  ?observationS ?observationP ?observationO .
}
WHERE {
  ...
}
LIMIT 100000
```

SPARQL UPDATE with LIMIT is not universally supported. Fuseki supports it, but GraphDB and Stardog have different behaviors:
- GraphDB: LIMIT applies to the WHERE clause results, not the DELETE
- Stardog: May ignore LIMIT in DELETE DATA operations

**Impact:**
- Query may fail on some triplestores
- May delete all observations at once instead of chunking
- Potential timeout on large cubes

**Remediation:**
- Document triplestore-specific behavior
- Use a SELECT subquery with LIMIT in the WHERE clause for better compatibility
- Implement chunking in application code rather than relying on LIMIT

---

## 3. MEDIUM SEVERITY ISSUES

### MED-001: Unused PREFIX Declarations

**Location:** Multiple query files

**Description:**
Several files declare prefixes that are never used:

| File | Unused Prefixes |
|------|-----------------|
| `01-list-all-cube-versions.rq` | `dcterms` (declared but optional patterns don't use it in final query) |
| `04-preview-triples-to-delete.rq` | `sh`, `rdf` (not used in main query) |
| `07-delete-observations-chunked.rq` | `sh`, `rdf` (not present but not needed) |
| `10-count-observations-per-cube.rq` | None declared, but simple query |

**Impact:**
- Minor performance overhead
- Confusing for maintainers

### MED-002: Inconsistent Handling of Cubes Without Version in URI

**Location:** [`queries/01-list-all-cube-versions.rq`](queries/01-list-all-cube-versions.rq:31), [`sparql.js`](cleanup-service/src/utils/sparql.js:27)

**Description:**
When a cube doesn't match the version pattern, it's assigned version `0`:
```sparql
BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), xsd:integer(?versionStr), 0) AS ?version)
```

This conflates:
1. Actual version 0 cubes (rare but possible)
2. Cubes without versioned URIs

**Impact:**
- Cubes without version patterns get sorted together with actual version 0
- May cause unexpected deletion behavior

**Remediation:**
Use a sentinel value or filter non-versioned cubes separately:
```sparql
BIND(IF(REGEX(STR(?cube), "^.*/[^/]+/[0-9]+$"), xsd:integer(?versionStr), UNDEF) AS ?version)
```

### MED-003: Duplicate Variable Bindings in Subqueries May Cause Inefficiency

**Location:** [`queries/03-identify-versions-to-delete.rq`](queries/03-identify-versions-to-delete.rq:12)

**Description:**
The query re-extracts version/baseCube in both outer and inner subqueries, causing redundant computation:
```sparql
SELECT ?cube ?baseCube ?version (COUNT(DISTINCT ?newerCube) + 1 AS ?rank)
WHERE {
  # Extracts version/baseCube here...
}
# Then outer query re-binds them
```

**Remediation:**
Pass bound variables through subqueries instead of recomputing:
```sparql
SELECT ?cube ?baseCube ?version ?rank
WHERE {
  {
    SELECT ?cube ?baseCube ?version (COUNT(DISTINCT ?newerCube) + 1 AS ?rank)
    WHERE {
      # ... compute once
    }
    GROUP BY ?cube ?baseCube ?version
  }
}
```

### MED-004: Missing Language Tag Handling in Title Extraction

**Location:** [`queries/01-list-all-cube-versions.rq`](queries/01-list-all-cube-versions.rq:26)

**Description:**
```sparql
OPTIONAL { ?cube schema:name ?title }
OPTIONAL { ?cube dcterms:title ?dcTitle }
```

The query doesn't filter by language tag, so it may return multiple titles for the same cube in different languages, or no title if only non-matching languages exist.

**Note:** The universal version correctly handles this:
```sparql
OPTIONAL { ?cube schema:name ?title . FILTER(lang(?title) = "en" || lang(?title) = "") }
```

**Remediation:**
Apply language filtering consistently:
```sparql
OPTIONAL { 
  ?cube schema:name ?title 
  FILTER(lang(?title) = "en" || lang(?title) = "")
}
```

### MED-005: Preview Query May Return Incomplete Results Due to LIMIT

**Location:** [`queries/05-preview-single-cube-triples.rq`](queries/05-preview-single-cube-triples.rq:66)

**Description:**
```sparql
LIMIT 1000
```

The preview query limits results to 1000 triples. For cubes with thousands of observations, this provides an incomplete picture of what will be deleted.

**Impact:**
- User may underestimate deletion impact
- Critical triples may not be visible in preview

**Remediation:**
- Document the limit clearly in query comments
- Consider pagination or showing statistics instead of full triples for large cubes
- Add a warning when LIMIT is reached

### MED-006: COUNT(DISTINCT *) Pattern May Be Slow on Large Datasets

**Location:** [`queries/04-preview-triples-to-delete.rq`](queries/04-preview-triples-to-delete.rq:11)

**Description:**
```sparql
(COUNT(DISTINCT ?metaTriple) AS ?metaTriples)
```

Where `?metaTriple` is a concatenated string:
```sparql
BIND(CONCAT(STR(?cubeToDelete), STR(?p1), STR(?metaLevel1)) AS ?metaTriple)
```

This pattern requires the triplestore to:
1. Materialize all concatenated strings
2. Apply DISTINCT
3. Count

On cubes with millions of observations, this is extremely slow.

**Remediation:**
For counting, use `COUNT(*)` directly on the triple pattern without the string concatenation indirection. The DISTINCT is unnecessary if the triple pattern produces unique bindings.

### MED-007: Potential for Cartesian Product in Version Ranking Query

**Location:** [`queries/03-identify-versions-to-delete.rq`](queries/03-identify-versions-to-delete.rq:27)

**Description:**
```sparql
OPTIONAL {
  ?newerCube a cube:Cube .
  # ... bindings ...
  FILTER(?newerBaseCube = ?baseCube && ?newerVersion > ?version)
}
```

Without proper scoping, if multiple cubes match the pattern, this could produce a Cartesian product before the FILTER is applied.

**Impact:**
- Performance degradation on large datasets
- Memory exhaustion on triplestores with poor optimizer

**Remediation:**
Move cube type check earlier and ensure triplestore can optimize the join:
```sparql
?newerCube a cube:Cube ;
           # ... additional patterns
FILTER(?newerBaseCube = ?baseCube && ?newerVersion > ?version)
```

### MED-008: Property Path `(<>|!<>)*` May Not Match All RDF Lists

**Location:** [`queries/05-preview-single-cube-triples.rq`](queries/05-preview-single-cube-triples.rq:42), [`sparql.js`](cleanup-service/src/utils/sparql.js:114)

**Description:**
The property path `(<>|!<>)*` is used to recursively traverse RDF lists:
```sparql
?property (<>|!<>)* ?subject .
```

This pattern:
- `<>|!<>` matches any property or its inverse
- `*` means zero or more repetitions

However, this may not correctly handle all RDF list structures, particularly:
- Lists with typed rdf:first/rdf:rest
- Lists with additional properties on intermediate nodes

**Remediation:**
Use the standard RDF list pattern:
```sparql
?property (rdf:rest*/rdf:first) ?listItem .
```
Or explicitly handle RDF list structure:
```sparql
?property rdf:rest* ?member .
?member rdf:first ?listItem .
```

### MED-009: `generateNewerVersionsFilter()` Creates Potentially Expensive EXISTS Pattern

**Location:** [`cleanup-service/src/utils/sparql.js`](cleanup-service/src/utils/sparql.js:310)

**Description:**
The dynamically generated FILTER EXISTS with N separate variables is complex:
```sparql
FILTER EXISTS {
    ?newer1 a cube:Cube .
    ...
    ?newer2 a cube:Cube .
    ...
    FILTER(?newer2 != ?newer1)
}
```

This creates N+1 lookups and N*(N-1)/2 inequality checks.

**Impact:**
- Query complexity grows quadratically with versionsToKeep
- May timeout on triplestores with poor EXISTS optimization

**Remediation:**
Consider using a subquery for ranking instead:
```sparql
{
  SELECT ?cube (COUNT(*) AS ?rank)
  WHERE {
    ?cube a cube:Cube .
    ?newer a cube:Cube .
    FILTER(?newerBase = ?base && ?newerVersion > ?version)
  }
  GROUP BY ?cube
}
FILTER(?rank > ${versionsToKeep})
```

### MED-010: Orphan Detection Query May Miss Some Orphan Types

**Location:** [`cleanup-service/src/utils/sparql.js`](cleanup-service/src/utils/sparql.js:340)

**Description:**
The orphan detection only checks for:
- ObservationSets
- NodeShapes
- PropertyShapes

It doesn't check for:
- Orphan observations (observations not linked to any observation set)
- Orphan dimension values
- Custom metadata structures

**Impact:**
- Incomplete cleanup
- Accumulation of orphan data over time

### MED-011: Inconsistent Date Property Handling

**Location:** [`queries/01-list-all-cube-versions.rq`](queries/01-list-all-cube-versions.rq:22)

**Description:**
The query checks for multiple date properties:
```sparql
OPTIONAL { ?cube schema:dateCreated ?dateCreated }
OPTIONAL { ?cube schema:dateModified ?dateModified }
OPTIONAL { ?cube dcterms:created ?dcCreated }
OPTIONAL { ?cube dcterms:modified ?dcModified }
```

But only binds `?dateCreated` and `?dateModified`, ignoring dcterms values. This is confusing.

**Remediation:**
Either:
1. Remove unused dcterms patterns
2. Or coalesce values: `BIND(COALESCE(?dateCreated, ?dcCreated) AS ?created)`

---

## 4. LOW SEVERITY ISSUES

### LOW-001: Missing Period at End of `sparql.js` Line 29

**Location:** [`cleanup-service/src/utils/sparql.js`](cleanup-service/src/utils/sparql.js:29)

**Description:**
```sparql
BIND(IF(REGEX(STR(?cube), "^.*/[0-9]+/?$"), xsd:integer(?versionStr), 0) AS ?version)
```

Missing a period (`.`) at the end of the statement before `BIND`. SPARQL is lenient but this is inconsistent.

### LOW-002: Inconsistent Comments in Query Headers

**Location:** Multiple files

**Description:**
Comments vary in style and completeness:
- Some use `# Query N:` prefix, others don't
- Some document parameters, others don't
- Some have warnings, others don't

**Remediation:**
Standardize comment format:
```sparql
# Query: Name
# Purpose: Description
# Parameters: List
# Warning: If applicable
```

### LOW-003: Query 10 Could Include Cube Metadata for Better Context

**Location:** [`queries/10-count-observations-per-cube.rq`](queries/10-count-observations-per-cube.rq:1)

**Description:**
The query only returns cube URI and count:
```sparql
SELECT ?cube (COUNT(?obs) AS ?observationCount)
```

Adding title or base cube info would make results more useful.

### LOW-004: Universal Query 5 Has Different Semantics Than Original Query 5

**Location:** Comparison of [`queries/05-preview-single-cube-triples.rq`](queries/05-preview-single-cube-triples.rq:1) vs [`queries/universal/05-preview-single-cube.rq`](queries/universal/05-preview-single-cube.rq:1)

**Description:**
- Original: Returns individual triples with categories
- Universal: Returns counts by category

This is intentional but confusing naming. The universal version is actually more like Query 4.

**Remediation:**
Rename files to reflect actual functionality:
- `05-preview-single-cube-details.rq` (original)
- `05-preview-single-cube-counts.rq` (universal)

### LOW-005: Potential Issue with String Concatenation in Count Query

**Location:** [`cleanup-service/src/utils/sparql.js`](cleanup-service/src/utils/sparql.js:33)

**Description:**
```javascript
BIND(CONCAT(STR(?cube), "|", STR(?p1), "|", STR(?metaLevel1)) AS ?metaTriple)
```

Using `|` as separator assumes no literal values contain `|`. While unlikely, this could theoretically cause collisions.

**Remediation:**
Use a more unique separator or hash:
```sparql
BIND(MD5(CONCAT(STR(?cube), STR(?p1), STR(?metaLevel1))) AS ?metaTriple)
```

### LOW-006: Type Conversion Inconsistency in sparql.js

**Location:** [`cleanup-service/src/utils/sparql.js`](cleanup-service/src/utils/sparql.js:199)

**Description:**
Some places use `parseInt(value, 10)` while others may rely on implicit conversion. Be consistent.

### LOW-007: Missing Error Handling for Query Timeouts

**Location:** [`cleanup-service/src/triplestore/base.js`](cleanup-service/src/triplestore/base.js:45)

**Description:**
No timeout is specified for fetch operations. Long-running queries could hang indefinitely.

**Remediation:**
Add timeout to fetch options:
```javascript
const response = await fetch(this.queryEndpoint, {
    method: 'POST',
    headers: { ... },
    body: query,
    timeout: 300000 // 5 minutes
});
```

### LOW-008: Unused Parameter in `deleteObservationsQuery`

**Location:** [`cleanup-service/src/utils/sparql.js`](cleanup-service/src/utils/sparql.js:138)

**Description:**
```javascript
function deleteObservationsQuery(graphUri, cubeUri, limit = 50000) {
    // Note: limit parameter kept for API compatibility but not used
```

The `limit` parameter is documented as unused but still in the API. Consider deprecating or implementing.

---

## 5. CORRECTNESS VERIFICATION

### Queries That Are Correctly Implemented

| Query | Purpose | Status |
|-------|---------|--------|
| `01-list-all-cube-versions.rq` | Discovery | ✓ Correct (minus noted issues) |
| `02-count-versions-per-cube.rq` | Analysis | ✓ Correct |
| `03-identify-versions-to-delete.rq` | Identification | ✓ Correct logic |
| `06-delete-single-cube.rq` | Deletion | ✓ Correct structure |
| `10-count-observations-per-cube.rq` | Counting | ✓ Correct |
| `identifyDeletionsQuery()` | API | ✓ Correct |
| `exportCubeQuery()` | Backup | ✓ Correct |

### Queries Requiring Attention

| Query | Issue | Priority |
|-------|-------|----------|
| `04-preview-triples-to-delete.rq` | Performance | Medium |
| `05-preview-single-cube-triples.rq` | LIMIT hides data | Medium |
| `07-delete-observations-chunked.rq` | LIMIT compatibility | High |
| `deleteAllOldVersionsQuery()` | Complexity | Medium |

---

## 6. RECOMMENDATIONS SUMMARY

### Immediate Actions (Before Production)

1. **CRITICAL:** Implement IRI validation in all `sparql.js` query builder functions
2. **HIGH:** Add comprehensive input validation to the CleanupService class
3. **HIGH:** Test DELETE queries with LIMIT on all supported triplestores
4. **HIGH:** Standardize regex patterns across all queries

### Short-term Improvements

1. **MEDIUM:** Refactor orphan detection to handle deeply nested structures
2. **MEDIUM:** Optimize preview queries for large cubes
3. **MEDIUM:** Add language tag filtering to all title extraction
4. **MEDIUM:** Implement query timeouts

### Long-term Improvements

1. **LOW:** Create parameterized query templates instead of string concatenation
2. **LOW:** Add query performance benchmarks
3. **LOW:** Implement comprehensive logging of query execution times
4. **LOW:** Create a query validation test suite

---

## 7. SECURITY CHECKLIST

- [ ] All user-provided IRIs are validated before query construction
- [ ] Graph URI whitelist is enforced
- [ ] Query injection attempts are logged and blocked
- [ ] All DELETE queries have been tested in dry-run mode
- [ ] Backup is always performed before deletion
- [ ] Query timeouts are configured
- [ ] Failed queries are properly handled without partial deletions

---

*End of Review*
