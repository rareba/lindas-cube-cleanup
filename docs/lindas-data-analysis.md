# LINDAS SFOE Cube Data Analysis

**Analysis Date**: 2025-01-07
**Graph**: `https://lindas.admin.ch/sfoe/cube`
**Total Triples**: 30,544,904

## Summary

| Metric | Value |
|--------|-------|
| Total cubes | ~98 |
| Cubes with >2 versions | 10 |
| Cube versions to delete | 57 |
| Versions to keep | 41 |

## Cubes with Multiple Versions (Cleanup Candidates)

| Base Cube | Versions | Keep | Delete |
|-----------|----------|------|--------|
| bfe_ogd18_gebaeudeprogramm_anzahl_gesuche | 20 | 19, 20 | 1-18 |
| bfe_ogd18_gebaeudeprogramm_auszahlungen | 11 | 10, 11 | 1-9 |
| bfe_ogd84_einmalverguetung_fuer_photovoltaikanlagen | 10 | 9, 10 | 1-8 |
| bfe_ogd18_gebaeudeprogramm_energiewirkung | 9 | 8, 9 | 1-7 |
| bfe_ogd18_gebaeudeprogramm_co2wirkung | 7 | 6, 7 | 1-5 |
| bfe_ogd115_gest_bilanz | 6 | 5, 6 | 1-4 |
| bfe_ogd56_energieperspektiven2050 | 5 | 4, 5 | 1-3 |
| bfe_ogd17_fuellungsgrad_speicherseen | 5 | 4, 5 | 1-3 |
| bfe_ogd10_energieforschungsstatistik_iea | 3 | 5, 6 | 4 |
| bfe_ogd10_energieforschungsstatistik_ch | 3 | 5, 6 | 4 |

## Observation Counts (Largest Cubes)

The following cubes have the most observations (data points):

| Cube | Observations |
|------|-------------|
| bfe_ogd100_kennzahlensharedmobility (v1, v2) | 543,537 each |
| bfe_ogd56_energieperspektiven2050 (all versions) | 132,672 each |
| bfe_ogd10_energieforschungsstatistik_iea/6 | 12,761 |
| bfe_ogd115_gest_bilanz (all versions) | 8,987 each |
| bfe_ogd17_fuellungsgrad_speicherseen | 1,150 each |

## Estimated Deletion Impact

### High-Volume Deletions (by observations)

1. **energieperspektiven2050** (versions 1-3): ~398,016 observations
2. **fuellungsgrad_speicherseen** (versions 1-3): ~3,450 observations
3. **gest_bilanz** (versions 1-4): ~35,948 observations
4. **energieforschungsstatistik_iea** (version 4): ~9,279 observations

### Building Program Cubes (many versions, few observations)

- anzahl_gesuche: 18 versions x ~162 obs = ~2,916 observations
- auszahlungen: 9 versions x ~900 obs = ~8,100 observations
- co2wirkung: 5 versions x ~70 obs = ~350 observations
- energiewirkung: 7 versions x ~70 obs = ~490 observations

## Data Quality Notes

### Trailing Slash Issue

Some cube URIs have inconsistent trailing slashes:
- `bfe_ogd56_energieperspektiven2050/1` vs `bfe_ogd56_energieperspektiven2050/1/`
- `bfe_ogd10_energieforschungsstatistik_iea/1/` (with slash)

This creates duplicate entries. The deletion queries handle both patterns.

### Version Numbering

All cubes use integer version numbers in the URI:
- Pattern: `https://energy.ld.admin.ch/sfoe/{cube_name}/{version}`
- Example: `https://energy.ld.admin.ch/sfoe/bfe_ogd84_einmalverguetung_fuer_photovoltaikanlagen/10`

## Full List of Versions to Delete

```
# 57 cube versions will be deleted:

bfe_ogd10_energieforschungsstatistik_ch/4
bfe_ogd10_energieforschungsstatistik_iea/4
bfe_ogd115_gest_bilanz/1, /2, /3, /4
bfe_ogd17_fuellungsgrad_speicherseen/1, /2, /3
bfe_ogd18_gebaeudeprogramm_anzahl_gesuche/1-18
bfe_ogd18_gebaeudeprogramm_auszahlungen/1-9
bfe_ogd18_gebaeudeprogramm_co2wirkung/1-5
bfe_ogd18_gebaeudeprogramm_energiewirkung/1-7
bfe_ogd56_energieperspektiven2050/1, /2, /3
bfe_ogd84_einmalverguetung_fuer_photovoltaikanlagen/1-8
```

## Verification Queries

Run these queries to verify the state before/after deletion:

1. Count total cubes: `queries/02-count-versions-per-cube.rq`
2. List versions to delete: `queries/03-identify-versions-to-delete.rq`
3. Count observations: `queries/10-count-observations-per-cube.rq`

## Recommendations

1. **Test locally first** - Download the graph and test on Fuseki
2. **Delete energieperspektiven2050 versions carefully** - They have 132k observations each
3. **Monitor the endpoint** during deletion - Large cubes may need chunked deletion
4. **Verify after deletion** - Re-run count queries to confirm success
